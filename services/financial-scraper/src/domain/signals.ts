import {
	AreaId,
	AssetId,
	AssetType,
	Dimension,
	SectorId,
	SourceId,
} from "@trading-model/contracts/wire/signals";
import { z } from "zod";
import { parseCronField } from "./cron-period";

/** §1.3: how a source is fetched. A protocol enters this list with its worker (`createProtocolWorkers`). */
export const Protocol = z.enum(["rest_api"]);
export type Protocol = z.infer<typeof Protocol>;

/** Body of a `rest_api` answer: JSON (default), CSV (an array of records keyed by the header line) or the raw text. */
const BodyFormat = z.enum(["json", "csv", "text"]);

/**
 * What a request is about: one asset, a whole sector when the data concerns
 * all its assets (weather for agriculture), or an economic area (euro area
 * inflation). A sector or area signal is stored once and served with the
 * signals of each asset of the sector, or of the asset's `areas`.
 */
export const Subject = z.union([
	z.strictObject({ assetId: AssetId }),
	z.strictObject({ sector: SectorId }),
	z.strictObject({ area: AreaId }),
]);
export type Subject = z.infer<typeof Subject>;

/** `{date-N}` in a request URL: the UTC date N days before the collection, YYYYMMDD; `{year}`: its UTC year. */
export const DATE_PLACEHOLDER = /\{(?:date-(\d{1,3})|year)\}/g;

export const SourceRequest = z.strictObject({
	subject: Subject,
	/** Dimension of the signals of this request; the source must cover it for the subject. */
	dimension: Dimension,
	/** HTTPS only: collected data must not travel in clear. May hold `{date-N}`. */
	url: z.url({ protocol: /^https$/ }),
	/** Settings of the source adapter for this request (e.g. the variables to read). */
	params: z.record(z.string(), z.string()).default({}),
});
export type SourceRequest = z.infer<typeof SourceRequest>;

/** The key sits in `SIGNAL_KEY_<SOURCE>`: a leak reaches one source only. */
const SourceAuth = z.strictObject({
	type: z.literal("api_key"),
	env: z.string().regex(/^SIGNAL_KEY_[A-Z0-9_]+$/),
	in: z.enum(["header", "query"]),
	/** Header or query parameter name. */
	name: z.string().regex(/^[\w-]+$/),
});

/**
 * One request over many assets: `url` holds `{asset.ticker}`, `{asset.isin}`
 * or `{asset.alias.<name>}`, filled (URL-encoded) for each asset the selector
 * keeps. Unfolded into `SourceRequest`s at load (`parseSignalRegistry`).
 */
export const SourceTemplate = z.strictObject({
	/** Assets kept: those listed and/or of this type and/or of this sector (at least one criterion). */
	select: z
		.strictObject({
			assetIds: z.array(AssetId).min(1).optional(),
			assetType: AssetType.optional(),
			sector: SectorId.optional(),
		})
		.refine((select) => Object.keys(select).length > 0, {
			message: "selector without criterion",
		}),
	dimension: Dimension,
	url: z.string().startsWith("https://"),
	params: z.record(z.string(), z.string()).default({}),
});
export type SourceTemplate = z.infer<typeof SourceTemplate>;

/**
 * §1.3: under which terms and how hard the source may be used (ADR-0075,
 * amends ADR-0036). `public-domain` and `attribution` are free for any use,
 * commercial included. `non-commercial` is free for personal or research use
 * only: it quotes the clause read and says whether a commercial licence
 * exists. Sources paid for the use made, or with no terms found, cannot be written.
 */
const AccessPolicy = z
	.strictObject({
		terms: z.enum(["public-domain", "attribution", "non-commercial"]),
		/** The terms (ToS, licence) read when the source was added. */
		termsUrl: z.url({ protocol: /^https$/ }),
		/** Credit owed to the source; required by `attribution` terms. */
		attribution: z.string().min(1).optional(),
		/** `non-commercial` only: the clause read, quoted short, with the reading date. */
		restrictions: z.string().min(1).optional(),
		/** `non-commercial` only: is there a commercial licence (recorded, never bought). */
		commercialLicence: z
			.enum(["available", "unavailable", "unknown"])
			.optional(),
		/** Where to get the licence; required when `commercialLicence` is `available`. */
		commercialLicenceUrl: z.url({ protocol: /^https$/ }).optional(),
		/** `none`, or a free API key read from the variable `env` (one per source), sent in a header or query parameter. */
		auth: z.union([z.literal("none"), SourceAuth]),
		/** Most requests a minute the collector sends to the source: it spaces them. */
		maxRequestsPerMinute: z.number().int().positive(),
		/** A 404 means "no fact for this request" (EDGAR companyconcept: a concept the company never reported), not a fetch failure. */
		notFoundIsEmpty: z.boolean().optional(),
		/** Most requests a day of the free tier: a registry whose schedule exceeds it is refused. */
		maxRequestsPerDay: z.number().int().positive().optional(),
	})
	.superRefine((policy, ctx) => {
		const issue = (path: string, message: string) =>
			ctx.addIssue({ code: "custom", path: [path], message });
		const restricted = policy.terms === "non-commercial";
		if (policy.terms === "attribution" && policy.attribution === undefined) {
			issue("attribution", "attribution terms need the credit to give");
		}
		for (const key of [
			"restrictions",
			"commercialLicence",
			"commercialLicenceUrl",
		] as const) {
			if (!restricted && policy[key] !== undefined) {
				issue(key, `${key} only applies to non-commercial terms`);
			}
		}
		if (!restricted) {
			return;
		}
		if (policy.restrictions === undefined) {
			issue("restrictions", "non-commercial terms need the clause read");
		}
		if (policy.commercialLicence === undefined) {
			issue(
				"commercialLicence",
				"non-commercial terms need a commercial licence status"
			);
		}
		if (
			policy.commercialLicence === "available" &&
			policy.commercialLicenceUrl === undefined
		) {
			issue(
				"commercialLicenceUrl",
				"an available commercial licence needs its URL"
			);
		}
	});

/** §1.3: a pair the source can feed. */
const Coverage = z.strictObject({ assetType: AssetType, dimension: Dimension });

export const Source = z.strictObject({
	id: SourceId,
	protocol: Protocol,
	/** Body format the worker decodes; absent = `json`. */
	format: BodyFormat.optional(),
	/** `csv` only: field separator, absent = comma. */
	delimiter: z.enum([",", ";"]).optional(),
	/** Turns a payload of this source into observations (`SOURCE_ADAPTERS`). */
	adapter: z.string().min(1),
	/** node-cron expression; at each tick the requests run one after the other. */
	schedule: z.string().min(1),
	/** Age of the last collection beyond which the source is stale; default: three periods of `schedule`. */
	maxAgeSeconds: z.number().positive().optional(),
	/** Prior trust in the source, copied into the confidence of its signals. */
	reliabilityScore: z.number().min(0).max(1),
	/** The source restates past values (split-adjusted prices): a replayed key overwrites the stored value instead of keeping the first. */
	restated: z.boolean().optional(),
	/** §1.3: the (asset type, dimension) pairs the source can feed. */
	covers: z.array(Coverage).min(1),
	accessPolicy: AccessPolicy,
	/**
	 * History request of `signal-backfill`: `url` holds `{from}` and `{to}` (YYYY-MM-DD,
	 * inclusive) and the asset holes of a template; `pageDays` is the widest window one request may cover.
	 * Absent: the source cannot be backfilled.
	 */
	history: z
		.strictObject({
			url: z
				.string()
				.startsWith("https://")
				.refine(
					(url) =>
						url.includes("{from}") &&
						url.includes("{to}") &&
						!/\{/.test(
							url
								.replace(/\{asset\.(ticker|isin|alias\.[a-z][a-z0-9_]*)\}/g, "")
								.replace(/\{(from|to)\}/g, "")
						) &&
						!/^https:\/\/[^/?#]*\{/.test(url),
					"history url needs {from} and {to}, no other hole than asset ones, none in the host"
				),
			pageDays: z.number().int().positive(),
		})
		.optional(),
	requests: z.array(SourceRequest).min(1),
});
export type Source = z.infer<typeof Source>;

/**
 * Requests sent on the busiest day: ticks of a day times requests. The weekday
 * field cannot make one weekday busier than another (every day has the same
 * hours and minutes), so only seconds, minutes and hours count.
 * shortcut: an unparsable field counts 0 (the registry refuses it itself); day-of-month and month are ignored, so a rare date overestimates.
 */
export function dailyRequests(source: {
	schedule: string;
	requests: readonly unknown[];
}): number {
	const fields = source.schedule.trim().split(/\s+/);
	const [seconds = "0", minute = "*", hour = "*"] =
		fields.length === 6 ? fields : ["0", ...fields];
	const sizes = [
		parseCronField(seconds, 0, 59),
		parseCronField(minute, 0, 59),
		parseCronField(hour, 0, 23),
	].map((values) => values?.size ?? 0);
	return sizes.reduce(
		(product, size) => product * size,
		source.requests.length
	);
}
