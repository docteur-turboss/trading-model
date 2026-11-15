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
const AssetType = z.enum([
	"crypto",
	"equity",
	"bond",
	"real_estate",
	"etf",
	"commodity_proxy",
]);
type AssetType = z.infer<typeof AssetType>;

/** §1.3: how a source is fetched. A protocol enters this list with its worker (`createProtocolWorkers`). */
export const Protocol = z.enum(["rest_api"]);
export type Protocol = z.infer<typeof Protocol>;

export const AssetId = z.string().regex(/^[A-Z0-9][A-Z0-9_-]{0,31}$/);
const SectorId = z.string().regex(/^[a-z][a-z0-9_]{0,31}$/);
/** Short code of an economic area (`EA`, `US`, `FR`...). */
const AreaId = z.string().regex(/^[A-Z][A-Z0-9]{1,7}$/);
const SourceId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);

/** §1.1: how the outside world names an asset, by scheme rather than one `symbol`. */
const Identifier = z.discriminatedUnion("scheme", [
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
type Identifier = z.infer<typeof Identifier>;

/** The identifier schemes each asset type is named with. */
const IDENTIFIER_SCHEMES: Record<AssetType, readonly Identifier["scheme"][]> = {
	crypto: ["ticker", "contract"],
	equity: ["ticker", "isin"],
	bond: ["isin", "series"],
	real_estate: ["insee"],
	etf: ["ticker", "isin"],
	commodity_proxy: ["ticker", "isin"],
};

/** What an ETF (or commodity proxy) holds and how it tracks it. */
const Exposure = z.strictObject({
	assetClass: z.enum([
		"equity",
		"bond",
		"real_estate",
		"commodity",
		"money_market",
		"crypto",
		"mixed",
	]),
	/** `synthetic` = swap replication. */
	replication: z.enum(["physical", "synthetic", "futures"]),
	region: z.string().min(1).optional(),
});

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
		/** Economic areas whose signals go to this asset (macro data of the area). */
		areas: z.array(AreaId).optional(),
		/** Only for `etf` and `commodity_proxy`. */
		exposure: Exposure.optional(),
		/** The asset's name at a source or in a reference (`cik`, `wikipedia`, `figi`...), for request templates. */
		aliases: z
			.record(z.string().regex(/^[a-z][a-z0-9_]*$/), z.string().min(1))
			.optional(),
	})
	.refine(
		(asset) =>
			IDENTIFIER_SCHEMES[asset.assetType].includes(asset.identifier.scheme),
		{
			message: "identifier scheme unused for this asset type",
			path: ["identifier"],
		}
	)
	.refine(
		(asset) =>
			!asset.exposure ||
			asset.assetType === "etf" ||
			asset.assetType === "commodity_proxy",
		{ message: "exposure only for etf and commodity_proxy", path: ["exposure"] }
	)
	.refine((asset) => _unique(asset.applicableDimensions), {
		message: "dimension listed twice",
		path: ["applicableDimensions"],
	});
export type Asset = z.infer<typeof Asset>;

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
	/** Exactly one of `assetId`, `sector` and `area` is set: the request subject. */
	assetId: AssetId.nullable(),
	sector: SectorId.nullable(),
	area: AreaId.nullable(),
	observedAt: z.iso.datetime(),
	ingestedAt: z.iso.datetime(),
	confidenceScore: z.number().min(0).max(1),
};

function _branch<TDimension extends Dimension>(dimension: TDimension) {
	return z.strictObject({
		...ENVELOPE,
		dimension: z.literal(dimension),
		payload: PAYLOADS[dimension],
	});
}

export const Signal = z
	.discriminatedUnion("dimension", [
		_branch("market"),
		_branch("fundamental"),
		_branch("social"),
		_branch("contextual"),
		_branch("legal"),
		_branch("macro"),
	])
	.refine(
		(signal) =>
			[signal.assetId, signal.sector, signal.area].filter(
				(subject) => subject !== null
			).length === 1,
		{ message: "exactly one of assetId, sector and area must be set" }
	);
export type Signal = z.infer<typeof Signal>;
