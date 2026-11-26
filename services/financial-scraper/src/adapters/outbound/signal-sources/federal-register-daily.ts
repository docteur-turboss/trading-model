import { z } from "zod";
import type { SourceAdapter } from "../../../domain/ports/signal-source.port";
import { DAY_MS, METRIC_PATTERN } from "./common";

/**
 * `GET https://www.federalregister.gov/api/v1/documents/facets/daily?conditions[...]`:
 * one entry per day of the range, a day without publication included (count 0).
 * Not paginated.
 */
const DailyFacet = z.record(
	z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	z.object({ count: z.number().int().nonnegative() })
);

/** Closing of a Federal Register day: midnight US Eastern, taken as 05:00 UTC (EST, the later). */
const DAY_CLOSE_UTC_HOUR = 5;

/**
 * Federal Register documents published per day (US federal government work:
 * public domain), for the agencies and document type the request's URL names:
 * regulatory activity aimed at a sector. `observedAt` is the close of the
 * publication day, when its count is final.
 */
export const FEDERAL_REGISTER_DAILY: SourceAdapter = {
	dimensions: ["legal"],
	params: z.object({ metric: z.string().regex(METRIC_PATTERN) }),
	normalize(payload, { params }) {
		return Object.entries(DailyFacet.parse(payload)).map(
			([day, { count }]) => ({
				key: day,
				observedAt: Date.parse(day) + DAY_MS + DAY_CLOSE_UTC_HOUR * 3_600_000,
				payload: {
					metric: params.metric,
					value: count,
					unit: "documents",
					jurisdiction: "US",
				},
			})
		);
	},
};
