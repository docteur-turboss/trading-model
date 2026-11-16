import { z } from "zod";
import type { SourceAdapter } from "../../../domain/ports/signal-source.port";

/** `GET https://api.tiingo.com/tiingo/daily/<ticker>/prices`: one record per session, raw and adjusted. */
const Prices = z.array(
	z.object({
		date: z.string().regex(/^\d{4}-\d{2}-\d{2}T/),
		open: z.number(),
		high: z.number(),
		low: z.number(),
		close: z.number(),
		volume: z.number().nonnegative(),
		adjClose: z.number(),
	})
);

const NEW_YORK_HOUR = new Intl.DateTimeFormat("en-US", {
	timeZone: "America/New_York",
	hour: "numeric",
	hourCycle: "h23",
});

/** Tiingo publishes US prices from 17:30 New York time (api.tiingo.com docs, read 2026-11-16). */
function _publishedAt(day: string) {
	const utc1730Est = Date.parse(`${day}T22:30:00Z`);
	return Number(NEW_YORK_HOUR.format(utc1730Est)) === 17
		? utc1730Est
		: utc1730Est - 3_600_000;
}

/**
 * Daily prices of one US-listed equity or ETF from Tiingo (free key, personal
 * use only, ADR-0078): the last session as `market` signals, `period` = the
 * session day, `observedAt` = 17:30 New York that day. A missing or non-numeric
 * field throws. Without `startDate` the API answers the last session only.
 */
export const TIINGO_DAILY_PRICES: SourceAdapter = {
	dimensions: ["market"],
	normalize(payload) {
		return Prices.parse(payload).flatMap((row) => {
			const day = row.date.slice(0, 10);
			const measures = {
				open: [row.open, "USD"],
				high: [row.high, "USD"],
				low: [row.low, "USD"],
				close: [row.close, "USD"],
				adjusted_close: [row.adjClose, "USD"],
				volume: [row.volume, "shares"],
			} as const;
			return Object.entries(measures).map(([metric, [value, unit]]) => ({
				key: day,
				observedAt: _publishedAt(day),
				payload: { metric, value, unit, period: { start: day, end: day } },
			}));
		});
	},
};
