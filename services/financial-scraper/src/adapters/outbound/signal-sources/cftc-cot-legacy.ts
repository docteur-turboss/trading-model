import { z } from "zod";
import type { SourceAdapter } from "../../../domain/ports/signal-source.port";

const Count = z
	.string()
	.regex(/^-?\d+$/)
	.transform(Number);

/**
 * `GET https://publicreporting.cftc.gov/resource/jun7-fc8e.json?cftc_contract_market_code=<code>`:
 * Commitments of Traders, legacy futures-only report, one row per week.
 * Numbers arrive as strings; a missing or blank field throws.
 */
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

const FRIDAY_AFTER_TUESDAY_MS = 3 * 86_400_000;
const NEW_YORK_HOUR = new Intl.DateTimeFormat("en-US", {
	timeZone: "America/New_York",
	hour: "numeric",
	hourCycle: "h23",
});

/**
 * The CFTC publishes "each Friday at 3:30 pm Eastern Time" the positions of the
 * Tuesday before (cftc.gov/MarketReports/CommitmentsofTraders).
 * shortcut: a holiday week publishes later than this, so `observedAt` can be
 * early by a few days there; upgrade when the CFTC release schedule is readable
 * as data.
 */
function _publishedAt(tuesday: string) {
	const friday1530Utc =
		Date.parse(`${tuesday}T20:30:00Z`) + FRIDAY_AFTER_TUESDAY_MS;
	// 15:30 EST is 20:30Z, 15:30 EDT is 19:30Z.
	return Number(NEW_YORK_HOUR.format(friday1530Utc)) === 15
		? friday1530Utc
		: friday1530Utc - 3_600_000;
}

/**
 * CFTC Commitments of Traders of one futures contract (public domain, the
 * CFTC asks to be acknowledged): net position of the non-commercials
 * ("funds") and of the commercials ("producers"), and the open interest.
 * A week without a report is no row, so no signal.
 */
export const CFTC_COT_LEGACY: SourceAdapter = {
	dimensions: ["market"],
	normalize(payload) {
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
				observedAt: _publishedAt(day),
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
