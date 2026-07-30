use nomanga_core::extension::rate_limit::{RateLimit, SourceMethod};
use std::collections::HashMap;
use std::time::{Duration, Instant};

pub struct RateLimiter {
    buckets: HashMap<SourceMethod, TokenBucket>,
}

impl RateLimiter {
    pub fn new(limits: &[RateLimit]) -> Self {
        let buckets = limits
            .iter()
            .filter(|l| l.requests > 0 && l.per_ms > 0)
            .map(|l| (l.method, TokenBucket::new(l.requests, l.per_ms)))
            .collect();
        Self { buckets }
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
}
