const MINUTE_MS = 60_000;
const WINDOW_MINUTES = 35 * 1440;

function _field(text: string, min: number, max: number): Set<number> {
	const values = new Set<number>();
	for (const part of text.split(",")) {
		const [range = "", step] = part.split("/");
		const [from, to] = range.split("-");
		const low = range === "*" ? min : Number(from);
		const high = range === "*" ? max : Number(to ?? (step ? max : from));
		for (let value = low; value <= high; value += Number(step ?? 1)) {
			values.add(value);
		}
	}
	return values;
}

/**
 * Longest gap in milliseconds between two runs of a 5-field cron expression
 * (a weekday-only cron: 3 days over a weekend).
 * shortcut: scans 35 days from an epoch Monday, a cron rarer than that
 * returns the window; no names (MON, JAN) or `7` for Sunday.
 */
export function cronMaxGapMs(expression: string): number {
	const [minute = "", hour = "", day = "", month = "", weekday = ""] =
		expression.trim().split(/\s+/);
	const sets = [
		_field(minute, 0, 59),
		_field(hour, 0, 23),
		_field(day, 1, 31),
		_field(month, 1, 12),
		_field(weekday, 0, 6),
	];
	let previous: number | null = null;
	let longest = 0;
	for (let i = 0; i < WINDOW_MINUTES; i++) {
		const at = new Date(Date.UTC(2024, 0, 1) + i * MINUTE_MS);
		const matches = [
			at.getUTCMinutes(),
			at.getUTCHours(),
			at.getUTCDate(),
			at.getUTCMonth() + 1,
			at.getUTCDay(),
		].every((value, field) => sets[field]?.has(value));
		if (matches) {
			longest = previous === null ? longest : Math.max(longest, i - previous);
			previous = i;
		}
	}
	return (longest || WINDOW_MINUTES) * MINUTE_MS;
}

/** Age in seconds beyond which a source is stale: its `maxAgeSeconds`, else three periods of its cron. */
export function sourceMaxAgeSeconds(source: {
	schedule: string;
	maxAgeSeconds?: number | undefined;
}): number {
	return source.maxAgeSeconds ?? (3 * cronMaxGapMs(source.schedule)) / 1000;
}
