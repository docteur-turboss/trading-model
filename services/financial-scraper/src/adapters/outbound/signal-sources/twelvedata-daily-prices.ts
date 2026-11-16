import { z } from "zod";
import type { SourceAdapter } from "../../../domain/ports/signal-source.port";

const NumericString = z
	.string()
	.regex(/^\d+(\.\d+)?$/)
	.transform(Number);

/** `GET https://api.twelvedata.com/time_series?interval=1day&outputsize=1`: values are strings; an error answer has no `values`. */
const TimeSeries = z.object({
	values: z.array(
		z.object({
			datetime: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
			open: NumericString,
			high: NumericString,
			low: NumericString,
			close: NumericString,
			volume: NumericString,
		})
	),
});

/**
 * Daily prices of one equity or ETF from Twelve Data (free key, internal use,
 * ADR-0078): the last session as `market` signals, `period` = the session day.
 * The API gives no release time: no `observedAt`, the collector stamps the
 * first collection, which the schedule runs after the US close. `close` is
 * split-adjusted by the API; there is no separate adjusted close. A missing or
 * non-numeric field, or an error answer, throws.
 */
export const TWELVEDATA_DAILY_PRICES: SourceAdapter = {
	dimensions: ["market"],
	normalize(payload) {
		return TimeSeries.parse(payload).values.flatMap((row) => {
			const day = row.datetime.slice(0, 10);
			const measures = {
				open: [row.open, "USD"],
				high: [row.high, "USD"],
				low: [row.low, "USD"],
				close: [row.close, "USD"],
				volume: [row.volume, "shares"],
			} as const;
			return Object.entries(measures).map(([metric, [value, unit]]) => ({
				key: day,
				payload: { metric, value, unit, period: { start: day, end: day } },
			}));
		});
	},
};
