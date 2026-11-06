import { z } from "zod";
import type { SourceAdapter } from "../../../domain/ports/signal-source.port";

/** Measured values of an NWS observation (the station's elevation is not one). */
const VARIABLES = [
	"temperature",
	"dewpoint",
	"windDirection",
	"windSpeed",
	"windGust",
	"barometricPressure",
	"seaLevelPressure",
	"visibility",
	"maxTemperatureLast24Hours",
	"minTemperatureLast24Hours",
	"precipitationLastHour",
	"precipitationLast3Hours",
	"precipitationLast6Hours",
	"relativeHumidity",
	"windChill",
	"heatIndex",
] as const;

const Quantity = z.object({
	unitCode: z.string().min(1).max(32),
	value: z.number().nullable(),
	qualityControl: z.string().optional(),
});

/** `GET https://api.weather.gov/stations/<station>/observations/latest` (GeoJSON). */
const StationObservation = z.object({
	geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
	properties: z.looseObject({
		stationId: z.string().min(1),
		timestamp: z.iso.datetime({ offset: true }),
	}),
});

const Params = z.object({
	variables: z
		.string()
		.transform((list) => list.split(","))
		.pipe(z.array(z.enum(VARIABLES)).min(1)),
});

/**
 * US National Weather Service, latest observation of a station (public
 * domain): one observation per requested variable the station reported.
 * A variable left out of the report or without value is no observation;
 * the quality control flag is kept for the consumers to weigh.
 * The measurement time (`details.measuredAt`) comes before NWS publishes the
 * value: `observedAt` is left to the collection time.
 */
export const NWS_LATEST_OBSERVATION: SourceAdapter = {
	dimensions: ["contextual"],
	params: Params,
	normalize(payload, { params }) {
		const { geometry, properties } = StationObservation.parse(payload);
		const [longitude, latitude] = geometry.coordinates;
		return Params.parse(params).variables.flatMap((variable) => {
			if (!(variable in properties)) {
				return [];
			}
			const { unitCode, value, qualityControl } = Quantity.parse(
				properties[variable]
			);
			if (value === null) {
				return [];
			}
			return [
				{
					key: String(Date.parse(properties.timestamp)),
					payload: {
						metric: variable,
						value,
						unit: unitCode,
						location: { latitude, longitude, name: properties.stationId },
						details: {
							qualityControl: qualityControl ?? null,
							measuredAt: properties.timestamp,
						},
					},
				},
			];
		});
	},
};
