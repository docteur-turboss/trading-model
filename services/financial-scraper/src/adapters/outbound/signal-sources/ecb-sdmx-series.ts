import { z } from "zod";
import type { SourceAdapter } from "../../../domain/ports/signal-source.port";

const Code = z.object({ id: z.string().min(1) });

/**
 * `GET https://data-api.ecb.europa.eu/service/data/<flow>/<series key>?lastNObservations=N&format=jsondata`:
 * one series in SDMX-JSON. An observation is `[value, ...attribute indexes]`,
 * keyed by the index of its TIME_PERIOD.
 */
const SdmxSeries = z.object({
	dataSets: z.tuple([
		z.object({
			series: z.record(
				z.string(),
				z.object({
					attributes: z.array(z.number().int().nullable()),
					observations: z.record(
						z.string(),
						z.tuple([z.number().nullable()]).rest(z.unknown())
					),
				})
			),
		}),
	]),
	structure: z.object({
		dimensions: z.object({
			series: z.array(z.object({ values: z.array(Code) })),
			observation: z.tuple([
				z.object({ id: z.literal("TIME_PERIOD"), values: z.array(Code) }),
			]),
		}),
		attributes: z.object({
			series: z.array(
				z.object({
					id: z.string(),
					values: z.array(z.object({ name: z.string().min(1) })),
				})
			),
		}),
	}),
});

type Sdmx = z.infer<typeof SdmxSeries>;

function _unit(structure: Sdmx["structure"], attributes: (number | null)[]) {
	const position = structure.attributes.series.findIndex(
		(attribute) => attribute.id === "UNIT"
	);
	const unit =
		structure.attributes.series[position]?.values[attributes[position] ?? -1];
	if (!unit) {
		throw new Error("ECB series without a UNIT attribute");
	}
	return unit.name;
}

/**
 * One ECB statistical series (ECB Data Portal: yields, exchange rates,
 * inflation...), free to reuse with "Source: ECB statistics". The payload
 * gives no release time, so a period is observed when first collected: the
 * store keeps that first row, never stamped before the period was public.
 */
export const ECB_SDMX_SERIES: SourceAdapter = {
	params: z.object({ metric: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/) }),
	normalize(payload, { params, collectedAt }) {
		const {
			dataSets: [dataSet],
			structure,
		} = SdmxSeries.parse(payload);
		const series = Object.entries(dataSet.series);
		if (series.length !== 1) {
			throw new Error(`Expected one ECB series, got ${series.length}`);
		}
		const [[key, { attributes, observations }]] = series;
		// "0:0:0" indexes the values of the series dimensions: the series code.
		const code = key.split(":").map((index, position) => {
			const value =
				structure.dimensions.series[position]?.values[Number(index)];
			if (!value) {
				throw new Error(`ECB series key ${key} outside its dimensions`);
			}
			return value.id;
		});
		const unit = _unit(structure, attributes);
		const periods = structure.dimensions.observation[0].values;
		return Object.entries(observations).flatMap(([index, [value]]) => {
			const period = periods[Number(index)]?.id;
			if (period === undefined) {
				throw new Error(`ECB observation ${index} outside TIME_PERIOD`);
			}
			if (value === null) {
				return [];
			}
			return [
				{
					metric: params.metric,
					value,
					unit,
					observedAt: collectedAt,
					key: period,
					attributes: { period, series: code.join(".") },
				},
			];
		});
	},
};
