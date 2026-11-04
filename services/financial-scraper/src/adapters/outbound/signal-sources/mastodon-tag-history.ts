import { z } from "zod";
import type { SourceAdapter } from "../../../domain/ports/signal-source.port";

const DAY_SECONDS = 86_400;

const Count = z.string().regex(/^\d+$/).transform(Number);

/** `GET https://<instance>/api/v1/tags/<name>`: daily use of a hashtag over the last 7 days. */
const Tag = z.object({
	name: z.string().min(1),
	history: z.array(
		z.object({
			/** Start of the UTC day, epoch seconds. */
			day: Count,
			uses: Count,
			accounts: Count,
		})
	),
});

/**
 * Mastodon hashtag activity as one instance counts it: posts and distinct
 * accounts per day. Counts only, no post or account. A day is observed once
 * over: today's count still grows, so it is left for the next collections.
 */
export const MASTODON_TAG_HISTORY: SourceAdapter = {
	normalize(payload, { collectedAt }) {
		const tag = Tag.parse(payload);
		const attributes = { tag: tag.name };
		return tag.history.flatMap(({ day, uses, accounts }) => {
			const observedAt = (day + DAY_SECONDS) * 1000;
			if (observedAt > collectedAt) {
				return [];
			}
			const key = String(day);
			return [
				{
					metric: "hashtag_uses",
					value: uses,
					unit: "posts",
					observedAt,
					key,
					attributes,
				},
				{
					metric: "hashtag_accounts",
					value: accounts,
					unit: "accounts",
					observedAt,
					key,
					attributes,
				},
			];
		});
	},
};
