import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

const RELATIVE_TIME = new Intl.RelativeTimeFormat(undefined, {
	numeric: "auto",
});

const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
	["year", 365 * 24 * 60 * 60],
	["month", 30 * 24 * 60 * 60],
	["week", 7 * 24 * 60 * 60],
	["day", 24 * 60 * 60],
	["hour", 60 * 60],
	["minute", 60],
];

/** "3 hours ago", "yesterday", … from an ISO timestamp. */
export function formatRelativeTime(iso: string): string {
	const seconds = (Date.parse(iso) - Date.now()) / 1000;
	const abs = Math.abs(seconds);

	if (abs < 60) return "just now";

	for (const [unit, span] of RELATIVE_STEPS) {
		if (abs >= span)
			return RELATIVE_TIME.format(Math.round(seconds / span), unit);
	}

	return "just now";
}

const MS_DAY = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Monday-based start of the week containing `d`. */
function startOfWeek(d: Date): Date {
	const s = startOfDay(d);
	s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
	return s;
}

function localDayKey(d: Date): string {
	const month = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${d.getFullYear()}-${month}-${day}`;
}

const DAY_HEADING = new Intl.DateTimeFormat(undefined, {
	weekday: "long",
	month: "short",
	day: "numeric",
});
const WEEK_HEADING = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
});
const MONTH_HEADING = new Intl.DateTimeFormat(undefined, {
	month: "long",
	year: "numeric",
});

/**
 * Bucket a timestamp for grouped history: by day within the last week, by week
 * up to roughly a month old, then by month. The `key` groups entries; the
 * `heading` labels the group.
 */
export function historyBucket(iso: string): { key: string; heading: string } {
	const date = new Date(iso);
	const daysAgo = Math.round(
		(startOfDay(new Date()).getTime() - startOfDay(date).getTime()) / MS_DAY,
	);

	if (daysAgo < 7) {
		const key = `d:${localDayKey(date)}`;
		if (daysAgo <= 0) return { key, heading: "Today" };
		if (daysAgo === 1) return { key, heading: "Yesterday" };
		return { key, heading: DAY_HEADING.format(date) };
	}

	if (daysAgo < 28) {
		const weekStart = startOfWeek(date);
		return {
			key: `w:${localDayKey(weekStart)}`,
			heading: `Week of ${WEEK_HEADING.format(weekStart)}`,
		};
	}

	return {
		key: `m:${date.getFullYear()}-${date.getMonth()}`,
		heading: MONTH_HEADING.format(date),
	};
}
