import { z } from "zod";
import type { SourceAdapter } from "../../../domain/ports/signal-source.port";
import { METRIC_PATTERN } from "./common";

const Categories = z.object({
	category: z.object({ index: z.record(z.string(), z.number().int()) }),
});

/**
 * `GET https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/<dataset>?<filters>&geo=<code>&format=JSON`:
 * JSON-stat 2.0, one flat `value` per cell, row-major over `id`/`size`
 * (`time` last). `status` holds the Eurostat flag of a cell (`p`, `e`...).
 */
const JsonStat = z.object({
	// "2026-11-04T11:00:00+0100": an offset without colon, which `z.iso.datetime` refuses.
	updated: z.string().refine((date) => !Number.isNaN(Date.parse(date))),
	id: z.array(z.string()),
	size: z.array(z.number().int()),
	value: z.record(z.string(), z.number().nullable()),
	status: z.record(z.string(), z.string()).optional(),
	dimension: z.object({ unit: Categories, geo: Categories, time: Categories }),
});

/** `2026-10` is that month, `2026-Q2` that quarter. */
function _period(code: string) {
	const [, year, month, quarter] =
		/^(\d{4})-(?:(\d{2})|Q([1-4]))$/.exec(code) ?? [];
	if (!year) {
		throw new Error(`Unknown Eurostat period ${code}`);
	}
	const first = month ? Number(month) : Number(quarter) * 3 - 2;
	const last = month ? first : first + 2;
	const day = (month0: number, dayOfMonth: number) =>
		new Date(Date.UTC(Number(year), month0 - 1, dayOfMonth))
			.toISOString()
			.slice(0, 10);
	return { start: day(first, 1), end: day(last + 1, 0) };
}

/**
 * One Eurostat dissemination series of one country or area (house prices,
 * HICP, unemployment), reusable with attribution (Eurostat copyright notice,
 * CC BY 4.0). `observedAt` is the dataset's `updated` time: it is not earlier
 * than the publication of any value in it. A value that changes at the next
 * release is a new observation (the value is in the key).
 */
export const EUROSTAT_JSONSTAT: SourceAdapter = {
	dimensions: ["macro"],
	params: z.object({
		metric: z.string().regex(METRIC_PATTERN),
		area: z.string().regex(/^[A-Z][A-Z0-9]{1,7}$/),
	}),
	normalize(payload, { params }) {
		const { updated, id, size, value, status, dimension } =
			JsonStat.parse(payload);
		const [unit] = Object.keys(dimension.unit.category.index);
		const [geo] = Object.keys(dimension.geo.category.index);
		const times = Object.entries(dimension.time.category.index);
		// A flat index is the time position only when every other dimension has one value.
		if (
			id[id.length - 1] !== "time" ||
			size.slice(0, -1).some((length) => length !== 1)
		) {
			throw new Error("Eurostat answer is not one series of one geo");
		}
		if (geo !== params.area || unit === undefined) {
			throw new Error(`Eurostat answer has no unit or no ${params.area}`);
		}
		const observedAt = Date.parse(updated);
		return times.flatMap(([code, index]) => {
			const cell = value[String(index)];
			if (cell === null || cell === undefined) {
				return [];
			}
			const flag = status?.[String(index)];
			return [
				{
					key: `${code}:${cell}`,
					observedAt,
					payload: {
						metric: params.metric,
						value: cell,
						unit,
						area: params.area,
						period: _period(code),
						...(flag && { details: { flag } }),
					},
				},
			];
		});
	},
};
