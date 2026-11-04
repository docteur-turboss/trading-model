import { z } from "zod";

/**
 * Schema of the multi-dimension signals (ADR-0036, design note §1): assets,
 * dimensions, sources and signals. Frozen: a change that breaks a reader of
 * the registry or of stored or served signals bumps this version.
 */
export const SIGNAL_SCHEMA_VERSION = 1;

/** §1.2: the kind of information, whatever the asset. */
export const Dimension = z.enum([
	"market",
	"fundamental",
	"social",
	"contextual",
	"legal",
	"macro",
]);
export type Dimension = z.infer<typeof Dimension>;

/** §1.1: the kind of asset; a commodity is reached through a proxy (ETF, ETC). */
export const AssetType = z.enum([
	"crypto",
	"equity",
	"bond",
	"real_estate",
	"etf",
	"commodity_proxy",
]);
export type AssetType = z.infer<typeof AssetType>;

/** §1.3: how a source is fetched. Only `rest_api` has a worker so far: the registry refuses the others. */
export const Protocol = z.enum([
	"rest_api",
	"html_scrape",
	"rss",
	"websocket",
	"file_feed",
]);
export type Protocol = z.infer<typeof Protocol>;

export const AssetId = z.string().regex(/^[A-Z0-9][A-Z0-9_-]{0,31}$/);
export const SectorId = z.string().regex(/^[a-z][a-z0-9_]{0,31}$/);
const SourceId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);

/** §1.1: how the outside world names an asset, by scheme rather than one `symbol`. */
export const Identifier = z.discriminatedUnion("scheme", [
	z.strictObject({
		scheme: z.literal("ticker"),
		ticker: z.string().regex(/^[A-Z0-9.-]{1,16}$/),
		/** Market identifier code (ISO 10383) of the listing, when the ticker needs one. */
		exchange: z
			.string()
			.regex(/^[A-Z0-9]{4}$/)
			.optional(),
	}),
	z.strictObject({
		scheme: z.literal("isin"),
		isin: z.string().regex(/^[A-Z]{2}[A-Z0-9]{9}\d$/),
	}),
	z.strictObject({
		scheme: z.literal("contract"),
		chain: z.string().regex(/^[a-z0-9-]{1,32}$/),
		address: z.string().min(1).max(128),
	}),
	z.strictObject({
		scheme: z.literal("insee"),
		/** Code of a French commune. */
		code: z.string().regex(/^(\d{5}|2[AB]\d{3})$/),
	}),
	z.strictObject({
		scheme: z.literal("series"),
		/** A benchmark with no security of its own, named by the series of its publisher. */
		provider: z.string().min(1),
		key: z.string().min(1),
	}),
]);
export type Identifier = z.infer<typeof Identifier>;

/** The identifier schemes each asset type is named with. */
const IDENTIFIER_SCHEMES: Record<AssetType, readonly Identifier["scheme"][]> = {
	crypto: ["ticker", "contract"],
	equity: ["ticker", "isin"],
	bond: ["isin", "series"],
	real_estate: ["insee"],
	etf: ["ticker", "isin"],
	commodity_proxy: ["ticker", "isin"],
};

function _unique(values: readonly unknown[]): boolean {
	return new Set(values).size === values.length;
}

export const Asset = z
	.strictObject({
		id: AssetId,
		name: z.string().min(1),
		assetType: AssetType,
		identifier: Identifier,
		/**
		 * §1.1: the dimensions that make sense for this asset (a government bond
		 * has no social data). Signals of other dimensions are neither collected
		 * nor served for it.
		 */
		applicableDimensions: z.array(Dimension).min(1),
		/** Level of the Sector Managers: sector signals go to every asset of the sector. */
		sector: SectorId,
	})
	.refine(
		(asset) =>
			IDENTIFIER_SCHEMES[asset.assetType].includes(asset.identifier.scheme),
		{
			message: "identifier scheme unused for this asset type",
			path: ["identifier"],
		}
	)
	.refine((asset) => _unique(asset.applicableDimensions), {
		message: "dimension listed twice",
		path: ["applicableDimensions"],
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
	/** Dimension of the signals of this request; the source must cover it for the subject. */
	dimension: Dimension,
	/** HTTPS only: collected data must not travel in clear. May hold `{date-N}`. */
	url: z.url({ protocol: /^https$/ }),
	/** Settings of the source adapter for this request (e.g. the variables to read). */
	params: z.record(z.string(), z.string()).default({}),
});
export type SourceRequest = z.infer<typeof SourceRequest>;

/**
 * §1.3: under which terms and how hard the source may be used. Terms are
 * free for any use, commercial and trading included, at most against
 * attribution: other terms (non-commercial, research only...) cannot be
 * written, so such a source cannot enter the registry.
 */
export const AccessPolicy = z
	.strictObject({
		terms: z.enum(["public-domain", "attribution"]),
		/** The terms (ToS, licence) read when the source was added. */
		termsUrl: z.url({ protocol: /^https$/ }),
		/** Credit owed to the source; required by `attribution` terms. */
		attribution: z.string().min(1).optional(),
		/** No key nor account: per-source secrets are not supported yet. */
		auth: z.literal("none"),
		/** Most requests a minute the collector sends to the source: it spaces them. */
		maxRequestsPerMinute: z.number().int().positive(),
	})
	.refine(
		(policy) =>
			policy.terms === "public-domain" || policy.attribution !== undefined,
		{
			message: "attribution terms need the credit to give",
			path: ["attribution"],
		}
	);

/** §1.3: a pair the source can feed. */
const Coverage = z.strictObject({ assetType: AssetType, dimension: Dimension });

export const Source = z.strictObject({
	id: SourceId,
	protocol: Protocol,
	/** Turns a payload of this source into observations (`SOURCE_ADAPTERS`). */
	adapter: z.string().min(1),
	/** node-cron expression; at each tick the requests run one after the other. */
	schedule: z.string().min(1),
	/** Prior trust in the source, copied into the confidence of its signals. */
	reliabilityScore: z.number().min(0).max(1),
	/** §1.3: the (asset type, dimension) pairs the source can feed. */
	covers: z.array(Coverage).min(1),
	accessPolicy: AccessPolicy,
	requests: z.array(SourceRequest).min(1),
});
export type Source = z.infer<typeof Source>;

const Scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);

/** Inclusive ISO dates: the time a value refers to (fiscal period, counted day...). */
const Period = z.strictObject({ start: z.iso.date(), end: z.iso.date() });

/** Common to every payload: one measured quantity. */
const MEASURE = {
	metric: z.string().regex(/^[\w.:-]{1,128}$/),
	value: z.number(),
	unit: z.string().min(1).max(32),
	/** What no canonical field holds and only the source knows (quality flags, codes...). */
	details: z.record(z.string(), Scalar).optional(),
};

/**
 * §1.4: the canonical payload of each dimension. Every payload is a measure
 * (`metric`, `value`, `unit`) plus what is needed to read it in its dimension.
 */
export const PAYLOADS = {
	/** A price, yield or volume of the asset; `period`: the day of a daily value. */
	market: z.strictObject({ ...MEASURE, period: Period.optional() }),
	/** A reported financial fact, for the period it covers, from the filing that reported it. */
	fundamental: z.strictObject({
		...MEASURE,
		period: Period,
		filing: z.strictObject({
			form: z.string().min(1),
			id: z.string().min(1),
			fiscalYear: z.number().int().nullable(),
			fiscalPeriod: z.string().nullable(),
		}),
	}),
	/** Attention or discussion: what was counted (`topic`), where (`platform`), over `period`. */
	social: z.strictObject({
		...MEASURE,
		platform: z.string().min(1),
		topic: z.string().min(1),
		period: Period,
	}),
	/** A measurement of the surroundings of the asset (weather...), where it was taken. */
	contextual: z.strictObject({
		...MEASURE,
		location: z.strictObject({
			latitude: z.number().min(-90).max(90),
			longitude: z.number().min(-180).max(180),
			name: z.string().min(1).optional(),
		}),
	}),
	/** A legal or regulatory measure (open cases, sanctions...) under a jurisdiction. */
	legal: z.strictObject({ ...MEASURE, jurisdiction: z.string().min(1) }),
	/** An economic indicator of an area over a period. */
	macro: z.strictObject({
		...MEASURE,
		area: z.string().min(1),
		period: Period,
	}),
} as const satisfies Record<Dimension, z.ZodType>;

/**
 * §1.4 envelope. `observedAt` (never earlier than the value was public) and
 * `confidenceScore` are served with the payload, never filtered on: a
 * consumer weighs a 3-month-old filing differently from a 3-second-old price.
 */
const ENVELOPE = {
	/** sha256 of source, subject, metric and observation key: a replayed collection stores nothing twice. */
	id: z.string().regex(/^[0-9a-f]{64}$/),
	schemaVersion: z.literal(SIGNAL_SCHEMA_VERSION),
	sourceId: SourceId,
	/** Exactly one of `assetId` and `sector` is set: the request subject. */
	assetId: AssetId.nullable(),
	sector: SectorId.nullable(),
	observedAt: z.iso.datetime(),
	ingestedAt: z.iso.datetime(),
	confidenceScore: z.number().min(0).max(1),
};

export const Signal = z
	.discriminatedUnion("dimension", [
		z.strictObject({
			...ENVELOPE,
			dimension: z.literal("market"),
			payload: PAYLOADS.market,
		}),
		z.strictObject({
			...ENVELOPE,
			dimension: z.literal("fundamental"),
			payload: PAYLOADS.fundamental,
		}),
		z.strictObject({
			...ENVELOPE,
			dimension: z.literal("social"),
			payload: PAYLOADS.social,
		}),
		z.strictObject({
			...ENVELOPE,
			dimension: z.literal("contextual"),
			payload: PAYLOADS.contextual,
		}),
		z.strictObject({
			...ENVELOPE,
			dimension: z.literal("legal"),
			payload: PAYLOADS.legal,
		}),
		z.strictObject({
			...ENVELOPE,
			dimension: z.literal("macro"),
			payload: PAYLOADS.macro,
		}),
	])
	.refine((signal) => (signal.assetId === null) !== (signal.sector === null), {
		message: "exactly one of assetId and sector must be set",
	});
export type Signal = z.infer<typeof Signal>;
