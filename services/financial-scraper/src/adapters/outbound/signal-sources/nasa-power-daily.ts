import { z } from "zod";
import type { SourceAdapter } from "../../../domain/ports/signal-source.port";

/** POWER's marker for a day without value. */
const FILL_VALUE = -999;

const Day = z.string().regex(/^\d{8}$/);

/** `GET https://power.larc.nasa.gov/api/temporal/daily/point` (GeoJSON, `parameters` read, never a forecast). */
const DailyPoint = z.object({
	geometry: z.object({
		coordinates: z.tuple([z.number(), z.number()]).rest(z.number()),
	}),
	properties: z.object({
		parameter: z.record(z.string(), z.record(Day, z.number())),
	}),
	parameters: z.record(z.string(), z.object({ units: z.string().min(1) })),
});

const Params = z.object({
	name: z.string().min(1),
	variables: z
		.string()
		.transform((list) => list.split(","))
		.pipe(z.array(z.string().min(1)).min(1)),
});

/**
 * NASA POWER daily point data (satellite and reanalysis, no commercial
 * restriction): the latest day with a value, per requested variable. A day at
 * the fill value or a variable the response lacks is no observation. The day
 * measured (`details.measuredAt`) comes before POWER publishes it, so
 * `observedAt` is left to the collection time.
 */
export const NASA_POWER_DAILY: SourceAdapter = {
	dimensions: ["contextual"],
	params: Params,
	normalize(payload, { params }) {
		const { geometry, properties, parameters } = DailyPoint.parse(payload);
		const { name, variables } = Params.parse(params);
		const [longitude, latitude] = geometry.coordinates;
		return variables.flatMap((variable) => {
			const latest = Object.entries(properties.parameter[variable] ?? {})
				.filter(([, value]) => value !== FILL_VALUE)
				.sort(([dayA], [dayB]) => dayA.localeCompare(dayB))
				.pop();
			const unit = parameters[variable]?.units;
			if (latest === undefined || unit === undefined) {
				return [];
			}
			const [day, value] = latest;
			return [
				{
					key: `${variable}-${day}`,
					payload: {
						metric: variable,
						value,
						unit,
						location: { latitude, longitude, name },
						details: {
							measuredAt: `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`,
						},
					},
				},
			];
		});
	},
};
