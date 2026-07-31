use nomanga_core::extension::rate_limit::{RateLimit, SourceMethod};
use std::collections::HashMap;
use std::time::{Duration, Instant};

pub struct RateLimiter {
    limits: Vec<RateLimit>,
    buckets: HashMap<SourceMethod, TokenBucket>,
}

impl RateLimiter {
    pub fn new(limits: &[RateLimit]) -> Self {
        let buckets = limits
            .iter()
            .filter(|l| l.requests > 0 && l.per_ms > 0)
            .map(|l| (l.method, TokenBucket::new(l.requests, l.per_ms)))
            .collect();

        Self {
            limits: limits.to_vec(),
            buckets,
        }
    }

    // Fresh buckets start full, so an unconditional swap would hand out a free
    // burst every time the budget is re-read. Re-reading usually confirms what
    // is already installed, and that case has to leave the spent tokens alone.
    pub fn replace(&mut self, limits: &[RateLimit]) -> bool {
        if self.limits == limits {
            return false;
        }

        *self = Self::new(limits);
        true
    }

    pub fn reserve(&mut self, method: SourceMethod) -> Duration {
        self.buckets
            .get_mut(&method)
            .map(TokenBucket::reserve)
            .unwrap_or(Duration::ZERO)
    }
}

struct TokenBucket {
    capacity: f64,
    tokens: f64,
    per_token_ms: f64,
    updated: Instant,
}

impl TokenBucket {
    fn new(requests: u32, per_ms: u64) -> Self {
        let capacity = f64::from(requests);
        Self {
            capacity,
            tokens: capacity,
            per_token_ms: per_ms as f64 / capacity,
            updated: Instant::now(),
        }
    }

    fn reserve(&mut self) -> Duration {
        let now = Instant::now();
        let elapsed_ms = now.saturating_duration_since(self.updated).as_secs_f64() * 1000.0;
        self.tokens = (self.tokens + elapsed_ms / self.per_token_ms).min(self.capacity);
        self.updated = now;

        if self.tokens >= 1.0 {
            self.tokens -= 1.0;
            return Duration::ZERO;
        }

        let wait = Duration::from_secs_f64((1.0 - self.tokens) * self.per_token_ms / 1000.0);
        self.tokens = 0.0;
        self.updated = now + wait;
        wait
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_a_burst_then_throttles() {
        let mut bucket = TokenBucket::new(3, 1_000);
        assert!(bucket.reserve().is_zero());
        assert!(bucket.reserve().is_zero());
        assert!(bucket.reserve().is_zero());

        let wait = bucket.reserve();
        assert!(wait >= Duration::from_millis(300) && wait <= Duration::from_millis(340));
    }

    #[test]
    fn unlimited_method_never_waits() {
        let mut limiter = RateLimiter::new(&[]);
        assert!(limiter.reserve(SourceMethod::Search).is_zero());
    }

    #[test]
    fn re_reading_the_same_budget_does_not_refill() {
        let limits = vec![RateLimit::new(SourceMethod::Search, 2, 1_000)];
        let mut limiter = RateLimiter::new(&limits);

        assert!(limiter.reserve(SourceMethod::Search).is_zero());
        assert!(limiter.reserve(SourceMethod::Search).is_zero());

        assert!(
            !limiter.replace(&limits),
            "an unchanged budget should not be reinstalled"
        );
        assert!(
            !limiter.reserve(SourceMethod::Search).is_zero(),
            "re-reading the same budget handed out a free burst"
        );
    }

    #[test]
    fn a_raised_budget_takes_effect() {
        let mut limiter = RateLimiter::new(&[RateLimit::new(SourceMethod::Search, 1, 60_000)]);

        assert!(limiter.reserve(SourceMethod::Search).is_zero());
        assert!(!limiter.reserve(SourceMethod::Search).is_zero());

        // What an API key that lifts the ceiling looks like once the configured
        // instance reports its real budget.
        assert!(limiter.replace(&[RateLimit::new(SourceMethod::Search, 4, 60_000)]));
        assert!(limiter.reserve(SourceMethod::Search).is_zero());
    }
}
