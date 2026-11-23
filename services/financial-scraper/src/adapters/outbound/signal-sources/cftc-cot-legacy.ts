import { z } from "zod";
import type { SourceAdapter } from "../../../domain/ports/signal-source.port";

const Count = z
	.string()
	.regex(/^-?\d+$/)
	.transform(Number);

const Rows = z.array(
	z.object({
		report_date_as_yyyy_mm_dd: z.string().regex(/^\d{4}-\d{2}-\d{2}T/),
		open_interest_all: Count,
		noncomm_positions_long_all: Count,
		noncomm_positions_short_all: Count,
		comm_positions_long_all: Count,
		comm_positions_short_all: Count,
	})
);

const DAY_MS = 86_400_000;
const NEW_YORK_HOUR = new Intl.DateTimeFormat("en-US", {
	timeZone: "America/New_York",
	hour: "numeric",
	hourCycle: "h23",
});

/** Nth (1-based, or -1 = last) weekday `dow` of a UTC month. */
function _nthWeekday(year: number, month: number, dow: number, nth: number) {
	const first = new Date(Date.UTC(year, month, 1));
	if (nth > 0) {
		return Date.UTC(
			year,
			month,
			1 + ((dow - first.getUTCDay() + 7) % 7) + 7 * (nth - 1)
		);
	}
	const last = new Date(Date.UTC(year, month + 1, 0));
	return last.getTime() - ((last.getUTCDay() - dow + 7) % 7) * DAY_MS;
}

/** UTC instant of `hour:minute` New York time on the UTC-midnight `day` (EST or EDT). */
export function newYorkLocalToUtc(day: number, hour: number, minute: number) {
	const est = day + (hour + 5) * 3_600_000 + minute * 60_000;
	return Number(NEW_YORK_HOUR.format(est)) === hour ? est : est - 3_600_000;
}

/** Federal holidays of a year as UTC midnights; a weekend one is observed on Friday or Monday. */
export function federalHolidays(year: number) {
	const fixed = [
		[0, 1],
		[5, 19],
		[6, 4],
		[10, 11],
		[11, 25],
	].map(([month, dayOfMonth]) => {
		const date = Date.UTC(year, month, dayOfMonth);
		const dow = new Date(date).getUTCDay();
		return dow === 6 ? date - DAY_MS : dow === 0 ? date + DAY_MS : date;
	});
	return new Set([
		...fixed,
		_nthWeekday(year, 0, 1, 3),
		_nthWeekday(year, 1, 1, 3),
		_nthWeekday(year, 4, 1, -1),
		_nthWeekday(year, 8, 1, 1),
		_nthWeekday(year, 9, 1, 2),
		_nthWeekday(year, 10, 4, 4),
	]);
}

/** Longest gap between two collections of a calendar source (both run hourly). */
const COLLECTION_INTERVAL_MS = 3_600_000;

/**
 * A report published later than its calendar says was unknown until a
 * collection saw it: never date it before the previous collection window.
 */
export function notBeforeCollection(publishedAt: number, ingestedAt?: number) {
	return ingestedAt === undefined
		? publishedAt
		: Math.max(publishedAt, ingestedAt - COLLECTION_INTERVAL_MS);
}

/**
 * The CFTC publishes at 3:30 pm Eastern Time, three business days after the
 * Tuesday it describes, so a federal holiday in between delays it
 * (cftc.gov/MarketReports/CommitmentsofTraders).
 */
function _publishedAt(tuesday: string) {
	let day = Date.parse(`${tuesday}T00:00:00Z`);
	const holidays = new Set([
		...federalHolidays(new Date(day).getUTCFullYear()),
		...federalHolidays(new Date(day).getUTCFullYear() + 1),
	]);
	for (let left = 3; left > 0; ) {
		day += DAY_MS;
		const dow = new Date(day).getUTCDay();
		if (dow !== 0 && dow !== 6 && !holidays.has(day)) {
			left--;
		}
	}
	return newYorkLocalToUtc(day, 15, 30);
}

/**
 * CFTC Commitments of Traders of one futures contract (public domain, the
 * CFTC asks to be acknowledged): net position of the non-commercials
 * ("funds") and of the commercials ("producers"), and the open interest.
 * Source: `jun7-fc8e.json?cftc_contract_market_code=<code>`, one row per week,
 * numbers as strings; a missing or blank field throws. A week without a
 * report is no row, so no signal.
 */
export const CFTC_COT_LEGACY: SourceAdapter = {
	dimensions: ["market"],
	normalize(payload, { ingestedAt }) {
		return Rows.parse(payload).flatMap((row) => {
			const day = row.report_date_as_yyyy_mm_dd.slice(0, 10);
			const measures = {
				net_position_funds:
					row.noncomm_positions_long_all - row.noncomm_positions_short_all,
				net_position_producers:
					row.comm_positions_long_all - row.comm_positions_short_all,
				open_interest: row.open_interest_all,
			};
			return Object.entries(measures).map(([metric, value]) => ({
				key: day,
				observedAt: notBeforeCollection(_publishedAt(day), ingestedAt),
				payload: {
					metric,
					value,
					unit: "contracts",
					period: { start: day, end: day },
				},
			}));
		});
	},
};
