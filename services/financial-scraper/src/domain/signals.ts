import { z } from "zod";

/**
 * Schema of the multi-dimension signals (ADR-0036): assets, dimensions,
 * sources and signals. Frozen: a change that breaks a reader of the registry
 * or of stored or served signals bumps this version.
 */
export const SIGNAL_SCHEMA_VERSION = 1;

/** Kind of information a source brings, whatever the asset. */
export const Dimension = z.enum([
	"market",
	"fundamental",
	"macro",
	"real_estate",
	"contextual",
	"social",
	"legal",
]);
export type Dimension = z.infer<typeof Dimension>;

/** How a source is fetched. Each protocol has its worker: only `rest_api` so far. */
export const Protocol = z.enum(["rest_api"]);
export type Protocol = z.infer<typeof Protocol>;

export const AssetId = z.string().regex(/^[A-Z0-9][A-Z0-9_-]{0,31}$/);
export const SectorId = z.string().regex(/^[a-z][a-z0-9_]{0,31}$/);
const SourceId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);

export const Asset = z.strictObject({
	id: AssetId,
	name: z.string().min(1),
	assetClass: z.enum([
		"crypto",
		"equity",
		"bond",
		"etf",
		"commodity",
		"real_estate",
	]),
	sector: SectorId,
});
export type Asset = z.infer<typeof Asset>;

/**
 * What a request is about: one asset, or a whole sector when the data
 * concerns all its assets (weather for agriculture). A sector signal is
 * stored once and served with the signals of each asset of the sector.
 */
export const Subject = z.union([
	z.strictObject({ assetId: AssetId }),
	z.strictObject({ sector: SectorId }),
]);
export type Subject = z.infer<typeof Subject>;

/** `{date-N}` in a request URL: the UTC date N days before the collection, YYYYMMDD. */
export const DATE_PLACEHOLDER = /\{date-(\d{1,3})\}/g;

export const SourceRequest = z.strictObject({
	subject: Subject,
	/**
	 * HTTPS only: collected data must not travel in clear. `{date-N}` stands
	 * for the UTC date N days before the collection, as YYYYMMDD (date ranges).
	 */
	url: z.url({ protocol: /^https$/ }),
	/** Settings of the source adapter for this request (e.g. the variables to read). */
	params: z.record(z.string(), z.string()).default({}),
});
export type SourceRequest = z.infer<typeof SourceRequest>;

/**
 * Terms of use of a source: free for any use, commercial and trading
 * included, at most against attribution. Terms that restrict the use
 * (non-commercial, research only...) cannot be declared, so such a source
 * cannot enter the registry.
 */
export const AccessPolicy = z
	.strictObject({
		terms: z.enum(["public-domain", "attribution"]),
		/** The terms read when the source was added. */
		termsUrl: z.url({ protocol: /^https$/ }),
		/** Credit owed to the source; required by `attribution` terms. */
		attribution: z.string().min(1).optional(),
	})
	.refine(
		(policy) =>
			policy.terms === "public-domain" || policy.attribution !== undefined,
		{
			message: "attribution terms need the credit to give",
			path: ["attribution"],
		}
	);

export const Source = z.strictObject({
	id: SourceId,
	dimension: Dimension,
	protocol: Protocol,
	/** Turns a payload of this source into observations (`SOURCE_ADAPTERS`). */
	adapter: z.string().min(1),
	/** node-cron expression; at each tick the requests run one after the other. */
	schedule: z.string().min(1),
	/** Prior trust in the source, copied into the confidence of its signals. */
	reliabilityScore: z.number().min(0).max(1),
	accessPolicy: AccessPolicy,
	requests: z.array(SourceRequest).min(1),
});
export type Source = z.infer<typeof Source>;

export const AttributeValue = z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.null(),
]);
export type AttributeValue = z.infer<typeof AttributeValue>;

/**
 * One observation of one metric about an asset or a sector. `observedAt`
 * (when the value was true in the world) and `confidenceScore` are served
 * with the value, never filtered on: a consumer weighs a 3-month-old filing
 * differently from a 3-second-old price.
 */
export const Signal = z
	.strictObject({
		/** sha256 of source, subject, metric and observation key: a replayed collection stores nothing twice. */
		id: z.string().regex(/^[0-9a-f]{64}$/),
		schemaVersion: z.literal(SIGNAL_SCHEMA_VERSION),
		sourceId: SourceId,
		dimension: Dimension,
		/** Exactly one of `assetId` and `sector` is set: the request subject. */
		assetId: AssetId.nullable(),
		sector: SectorId.nullable(),
		metric: z.string().regex(/^[\w.:-]{1,128}$/),
		value: z.number(),
		unit: z.string().min(1).max(32),
		observedAt: z.iso.datetime(),
		collectedAt: z.iso.datetime(),
		confidenceScore: z.number().min(0).max(1),
		/** What only the source knows: filing form, coordinates... */
		attributes: z.record(z.string(), AttributeValue),
	})
	.refine((signal) => (signal.assetId === null) !== (signal.sector === null), {
		message: "exactly one of assetId and sector must be set",
	});
export type Signal = z.infer<typeof Signal>;
