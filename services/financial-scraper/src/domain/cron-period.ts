const MINUTE_MS = 60_000;
const WINDOW_MINUTES = 400 * 1440;
const PART = /^(\*|\d+(-\d+)?)(\/\d+)?$/;

function _field(text: string, min: number, max: number): Set<number> | null {
	const values = new Set<number>();
	for (const part of text.split(",")) {
		if (!PART.test(part)) {
			return null;
		}
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
 * over 400 days (a weekday-only cron: 3 days over a weekend; day of month and
 * weekday both set: either matches). `undefined` when the expression is not
 * numeric (names, 6 fields) or runs less than twice in the window.
 * shortcut: a cron rarer than yearly is unreadable, the registry then asks for `maxAgeSeconds`.
 */
export function cronMaxGapMs(expression: string): number | undefined {
	const fields = expression.trim().split(/\s+/);
	const [minute, hour, day = "", month, weekday = ""] = [
		_field(fields[0] ?? "", 0, 59),
		_field(fields[1] ?? "", 0, 23),
		fields[2],
		_field(fields[3] ?? "", 1, 12),
		fields[4],
	];
	const days = _field(day, 1, 31);
	const weekdays = _field(weekday, 0, 7);
	if (fields.length !== 5 || !minute || !hour || !month || !days || !weekdays) {
		return undefined;
	}
	if (weekdays.has(7)) {
		weekdays.add(0);
	}
	const either = day !== "*" && weekday !== "*";
	let previous: number | null = null;
	let longest = 0;
	for (let i = 0; i < WINDOW_MINUTES; i++) {
		const at = new Date(Date.UTC(2024, 0, 1) + i * MINUTE_MS);
		const dayOk = days.has(at.getUTCDate());
		const weekdayOk = weekdays.has(at.getUTCDay());
		if (
			minute.has(at.getUTCMinutes()) &&
			hour.has(at.getUTCHours()) &&
			month.has(at.getUTCMonth() + 1) &&
			(either ? dayOk || weekdayOk : dayOk && weekdayOk)
		) {
			longest = previous === null ? longest : Math.max(longest, i - previous);
			previous = i;
		}
	}
	return longest ? longest * MINUTE_MS : undefined;
}

/** Age in seconds beyond which a source is stale: its `maxAgeSeconds`, else three periods of its cron. */
export function sourceMaxAgeSeconds(source: {
	schedule: string;
	maxAgeSeconds?: number | undefined;
}): number {
	const gap = cronMaxGapMs(source.schedule);
	if (source.maxAgeSeconds === undefined && gap === undefined) {
		throw new Error(`schedule "${source.schedule}" needs a maxAgeSeconds`);
	}
	return source.maxAgeSeconds ?? (3 * (gap as number)) / 1000;
}
