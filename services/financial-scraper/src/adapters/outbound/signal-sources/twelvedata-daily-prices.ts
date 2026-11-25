import { z } from "zod";
import {
	HttpStatusError,
	type SourceAdapter,
} from "../../../domain/ports/signal-source.port";

const NumericString = z
	.string()
	.regex(/^\d+(\.\d+)?$/)
	.transform(Number);

/** `GET https://api.twelvedata.com/time_series?interval=1day&outputsize=10&start_date=…`: values are strings; an error answer has no `values`. */
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

/** Twelve Data reports a quota overrun as HTTP 200 with `code: 429` in the body. */
const ErrorBody = z.object({
	code: z.number(),
	message: z.string().optional(),
});

/**
 * Daily prices of one equity or ETF from Twelve Data (free key, internal use,
 * ADR-0078): sessions as `market` signals, `period` = the session day.
 * The API gives no release time: live and backfill bars alike are dated 21:00
 * UTC of their day, after the US close all year, so a point-in-time read sees
 * a bar no earlier than the session ended and one bar has one id. `close` is
 * split-adjusted by the API; there is no separate adjusted close. A missing or
 * non-numeric field, or an error answer, throws.
 */
export const TWELVEDATA_DAILY_PRICES: SourceAdapter = {
	dimensions: ["market"],
	normalize(payload) {
		const error = ErrorBody.safeParse(payload);
		if (error.success && error.data.code === 429) {
			throw new HttpStatusError(error.data.message ?? "rate limited", 429);
		}
		return TimeSeries.parse(payload).values.flatMap((row) => {
			const day = row.datetime.slice(0, 10);
			const measures = {
				open: [row.open, "USD"],
				high: [row.high, "USD"],
				low: [row.low, "USD"],
				close: [row.close, "USD"],
				volume: [row.volume, "shares"],
			} as const;
			const observedAt = Date.parse(`${day}T21:00:00Z`);
			return Object.entries(measures).map(([metric, [value, unit]]) => ({
				key: day,
				observedAt,
				payload: { metric, value, unit, period: { start: day, end: day } },
			}));
		});
	},
};
