import { z } from "zod";
import type { SourceAdapter } from "../../../domain/ports/signal-source.port";

/**
 * `GET https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&current=<variables>`:
 * current conditions of the model grid cell nearest to the coordinates.
 */
const Forecast = z.object({
	latitude: z.number(),
	longitude: z.number(),
	utc_offset_seconds: z.number().int(),
	current_units: z.record(z.string(), z.string()),
	current: z
		.object({
			/** Local to the requested timezone, without offset. */
			time: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
			/** Seconds summed by the sums (precipitation) up to `time`. */
			interval: z.number().int().positive(),
		})
		.catchall(z.number().nullable()),
});

/**
 * Open-Meteo current weather: one observation per requested variable, in the
 * unit Open-Meteo reports it. A variable the model has no value for (null)
 * is no observation.
 */
export const OPEN_METEO_CURRENT: SourceAdapter = {
	normalize(payload) {
		const forecast = Forecast.parse(payload);
		const { time, interval, ...variables } = forecast.current;
		const observedAt =
			Date.parse(`${time}:00Z`) - forecast.utc_offset_seconds * 1000;
		const attributes = {
			latitude: forecast.latitude,
			longitude: forecast.longitude,
			intervalSeconds: interval,
		};
		return Object.entries(variables).flatMap(([metric, value]) => {
			if (value === null) {
				return [];
			}
			const unit = forecast.current_units[metric];
			if (!unit) {
				throw new Error(`Open-Meteo sent ${metric} without its unit`);
			}
			return [
				{
					metric,
					value,
					unit,
					observedAt,
					key: String(observedAt),
					attributes,
				},
			];
		});
	},
};
