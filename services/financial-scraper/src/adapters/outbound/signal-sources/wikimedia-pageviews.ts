import { z } from "zod";
import type { SourceAdapter } from "../../../domain/ports/signal-source.port";

/**
 * `GET https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/<project>/<access>/<agent>/<article>/daily/<start>/<end>`.
 */
const Pageviews = z.object({
	items: z.array(
		z.object({
			project: z.string().min(1),
			article: z.string().min(1),
			granularity: z.literal("daily"),
			/** YYYYMMDD00: the UTC day counted. */
			timestamp: z.string().regex(/^\d{8}00$/),
			views: z.number().int().nonnegative(),
		})
	),
});

/**
 * Wikipedia views of an article per day (CC0): public attention to the
 * asset. The API gives no release time, so a day is observed when first
 * collected: the store keeps that first row, never stamped before the day
 * was public. `day` says which day was counted.
 */
export const WIKIMEDIA_PAGEVIEWS: SourceAdapter = {
	normalize(payload, { collectedAt }) {
		return Pageviews.parse(payload).items.map((item) => {
			const { timestamp } = item;
			const day = `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}`;
			return {
				metric: "pageviews",
				value: item.views,
				unit: "views",
				observedAt: collectedAt,
				key: day,
				attributes: { project: item.project, article: item.article, day },
			};
		});
	},
};
