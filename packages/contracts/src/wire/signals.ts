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

export const AssetId = z.string().regex(/^[A-Z0-9][A-Z0-9_-]{0,31}$/);
export const SectorId = z.string().regex(/^[a-z][a-z0-9_]{0,31}$/);
/** Short code of an economic area (`EA`, `US`, `FR`...). */
export const AreaId = z.string().regex(/^[A-Z][A-Z0-9]{1,7}$/);
export const SourceId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);

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

/** Body of `GET /v2/signals/assets/:assetId`. */
export const AssetSignalsResponse = z.object({
	asset: Asset,
	/** Oldest first. */
	signals: z.array(Signal),
	/** More than MAX_SIGNALS_PER_ANSWER (5000) signals: narrow the window. */
	truncated: z.boolean(),
});
