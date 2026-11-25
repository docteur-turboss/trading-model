import { z } from "zod";
import type { SourceAdapter } from "../../../domain/ports/signal-source.port";

/** `GET /fred/series/observations`: a value is `"."` when the agency has none for the period. */
const Observations = z.object({
	observations: z.array(
		z.object({
			realtime_start: z.iso.date(),
			date: z.iso.date(),
			value: z.string(),
		})
	),
});

const DAY_MS = 86_400_000;
/** Calendar months a period covers; absent = one day. */
const MONTHS = { month: 1, quarter: 3 } as const;

function _periodEnd(start: string, span: keyof typeof MONTHS | "day") {
	if (span === "day") {
		return start;
	}
	const [year, month] = start.split("-").map(Number);
	return new Date(Date.UTC(year, month - 1 + MONTHS[span], 1) - DAY_MS)
		.toISOString()
		.slice(0, 10);
}

/**
 * One FRED series of a US federal agency (FRED API, request with
 * `realtime_start=1776-07-04&realtime_end=9999-12-31` so every vintage comes):
 * a `macro` payload per (period, vintage). `observedAt` is the end of the
 * vintage day (`realtime_start`, UTC: FRED gives no release time), so a revision is a second signal and the first stays.
 */
export const FRED_SERIES_OBSERVATIONS: SourceAdapter = {
	dimensions: ["macro"],
	params: z.object({
		metric: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
		area: z.string().min(1),
		unit: z.string().min(1).max(32),
		period: z.enum(["day", "month", "quarter"]),
		series: z.string().min(1),
	}),
	normalize(payload, { params }) {
		const span = params.period as keyof typeof MONTHS | "day";
		return Observations.parse(payload).observations.flatMap((row) => {
			const value = Number(row.value);
			if (
				row.value === "." ||
				row.value.trim() === "" ||
				!Number.isFinite(value)
			) {
				return [];
			}
			return [
				{
					key: `${row.date}@${row.realtime_start}`,
					observedAt: Date.parse(row.realtime_start) + DAY_MS,
					payload: {
						metric: params.metric,
						value,
						unit: params.unit,
						area: params.area,
						period: { start: row.date, end: _periodEnd(row.date, span) },
						details: { series: params.series },
					},
				},
			];
		});
	},
};
