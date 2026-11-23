import { readFileSync } from "node:fs";
import {
	Asset,
	SIGNAL_SCHEMA_VERSION,
} from "@trading-model/contracts/wire/signals";
import cron from "node-cron";
import { z } from "zod";
import { SOURCE_ADAPTERS } from "../adapters/outbound/signal-sources/source-adapters";
import { cronMaxGapMs } from "../domain/cron-period";
import type { SourceAdapter } from "../domain/ports/signal-source.port";
import {
	DATE_PLACEHOLDER,
	dailyRequests,
	Source,
	SourceRequest,
	SourceTemplate,
} from "../domain/signals";
import REGISTRY_FILE from "./signal-registry.json";

/** The source registry (`signal-registry.json`, ADR-0036), checked. */
export interface SignalRegistry {
	assets: ReadonlyMap<string, Asset>;
	sources: readonly Source[];
}

/** A source as written in the file: `requests` and/or `templates`. */
const SourceDeclaration = Source.omit({ requests: true })
	.extend({
		requests: z.array(SourceRequest).default([]),
		templates: z.array(SourceTemplate).default([]),
	})
	.refine((source) => source.requests.length + source.templates.length > 0, {
		message: "no request nor template",
	})
	.refine(
		(source) => {
			if (!cron.validate(source.schedule)) {
				return true; // reported with the other problems
			}
			const gap = cronMaxGapMs(source.schedule);
			return source.maxAgeSeconds === undefined
				? gap !== undefined
				: gap === undefined || source.maxAgeSeconds * 1000 >= gap;
		},
		{
			message:
				"maxAgeSeconds is shorter than the period of schedule, or schedule is unreadable (names, 6 fields, rarer than yearly) without maxAgeSeconds",
		}
	);

const RegistryFile = z.strictObject({
	schemaVersion: z.literal(SIGNAL_SCHEMA_VERSION),
	assets: z.array(Asset).min(1),
	sources: z.array(SourceDeclaration),
});

const HOLE = /\{asset\.(ticker|isin|alias\.[a-z][a-z0-9_]*)\}/g;

function _holeValue(asset: Asset, hole: string): string | undefined {
	const { identifier } = asset;
	if (hole.startsWith("alias.")) {
		return asset.aliases?.[hole.slice(6)];
	}
	if (hole === "ticker" && identifier.scheme === "ticker") {
		return identifier.ticker;
	}
	return hole === "isin" && identifier.scheme === "isin"
		? identifier.isin
		: undefined;
}

/** Unfolds the templates of a source into requests; every problem goes to `problems`. */
function _expandTemplates(
	source: { id: string; templates: readonly SourceTemplate[] },
	assets: readonly Asset[],
	problems: string[]
): SourceRequest[] {
	return source.templates.flatMap((template, index) => {
		const where = `source ${source.id}, template ${index}`;
		const { assetIds, assetType, sector } = template.select;
		for (const id of assetIds ?? []) {
			if (!assets.some((asset) => asset.id === id)) {
				problems.push(`${where}: unknown asset ${id}`);
			}
		}
		const selected = assets.filter(
			(asset) =>
				(!assetIds || assetIds.includes(asset.id)) &&
				(!assetType || asset.assetType === assetType) &&
				(!sector || asset.sector === sector)
		);
		if (selected.length === 0) {
			problems.push(`${where}: selector matches no asset`);
		}
		const holes = [...template.url.matchAll(HOLE)].map((match) => match[1]);
		const stray = /\{(?!date-\d)/.test(template.url.replace(HOLE, ""));
		// A hole in the host would let an asset value pick the host.
		if (stray || /^https:\/\/[^/?#]*\{/.test(template.url)) {
			problems.push(`${where}: unknown or misplaced hole in ${template.url}`);
		}
		return selected.flatMap((asset) => {
			if (!asset.applicableDimensions.includes(template.dimension)) {
				problems.push(
					`${where}: ${template.dimension} not applicable to asset ${asset.id}`
				);
				return [];
			}
			const missing = holes.filter(
				(hole) => _holeValue(asset, hole) === undefined
			);
			for (const hole of missing) {
				problems.push(`${where}: asset ${asset.id} has no ${hole}`);
			}
			if (missing.length > 0) {
				return [];
			}
			return [
				{
					subject: { assetId: asset.id },
					dimension: template.dimension,
					url: template.url.replace(HOLE, (_, hole: string) =>
						encodeURIComponent(_holeValue(asset, hole) as string)
					),
					params: template.params,
				},
			];
		});
	});
}

function _duplicates(ids: readonly string[]): string[] {
	return ids.filter((id, index) => ids.indexOf(id) !== index);
}

/** The assets a request is about: its asset, or every asset of its sector or area. */
function _subjectAssets(
	request: SourceRequest,
	assets: readonly Asset[]
): Asset[] {
	const { subject } = request;
	if ("assetId" in subject) {
		return assets.filter((asset) => asset.id === subject.assetId);
	}
	return "sector" in subject
		? assets.filter((asset) => asset.sector === subject.sector)
		: assets.filter((asset) => asset.areas?.includes(subject.area));
}

function _requestProblems(
	source: Source,
	adapter: SourceAdapter | undefined,
	assets: readonly Asset[]
): string[] {
	return source.requests.flatMap((request, index) => {
		const where = `source ${source.id}, request ${index}`;
		const { subject, dimension } = request;
		const problems: string[] = [];
		const targets = _subjectAssets(request, assets);
		if (targets.length === 0) {
			problems.push(
				"assetId" in subject
					? `${where}: unknown asset ${subject.assetId}`
					: "sector" in subject
						? `${where}: no asset in sector ${subject.sector}`
						: `${where}: no asset in area ${subject.area}`
			);
		}
		// Collected for at least one asset that the source covers and to which the dimension applies.
		const fed = targets.filter(
			(asset) =>
				asset.applicableDimensions.includes(dimension) &&
				source.covers.some(
					(pair) =>
						pair.assetType === asset.assetType && pair.dimension === dimension
				)
		);
		if (targets.length > 0 && fed.length === 0) {
			problems.push(
				`${where}: ${dimension} is not covered by the source or not applicable to its subject`
			);
		}
		if (adapter && !adapter.dimensions.includes(dimension)) {
			problems.push(
				`${where}: adapter ${source.adapter} writes no ${dimension} payload`
			);
		}
		if (/[{}]/.test(request.url.replace(DATE_PLACEHOLDER, ""))) {
			problems.push(`${where}: URL placeholder other than {date-N} or {year}`);
		}
		const params = adapter?.params?.safeParse(request.params);
		if (params?.success === false) {
			problems.push(`${where}: params ${z.prettifyError(params.error)}`);
		}
		return problems;
	});
}

/**
 * Parses the registry and checks what its schema alone cannot: unique ids,
 * known subjects and adapters, valid schedules, dimensions
 * covered by the source and applicable to the subject, adapter params, URL
 * placeholders. Throws with every problem found, so a broken registry stops
 * the service at startup.
 */
export function parseSignalRegistry(raw: unknown): SignalRegistry {
	const file = RegistryFile.parse(raw);
	const problems = [
		..._duplicates(file.assets.map((asset) => asset.id)).map(
			(id) => `asset ${id} declared twice`
		),
		..._duplicates(file.sources.map((source) => source.id)).map(
			(id) => `source ${id} declared twice`
		),
		..._duplicates(
			file.sources.flatMap(({ accessPolicy: { auth } }) =>
				auth === "none" ? [] : [auth.env]
			)
		).map((env) => `key variable ${env} used by two sources`),
	];
	const sources: Source[] = [];
	for (const declared of file.sources) {
		const { templates: _templates, ...rest } = declared;
		const source = {
			...rest,
			requests: [
				...declared.requests,
				..._expandTemplates(declared, file.assets, problems),
			],
		};
		sources.push(source);
		const adapter = SOURCE_ADAPTERS.get(source.adapter);
		if (!adapter) {
			problems.push(`source ${source.id}: unknown adapter ${source.adapter}`);
		}
		if (!cron.validate(source.schedule)) {
			problems.push(
				`source ${source.id}: invalid schedule "${source.schedule}"`
			);
		}
		const quota = source.accessPolicy.maxRequestsPerDay;
		const planned = dailyRequests(source);
		if (quota !== undefined && planned > quota) {
			problems.push(
				`source ${source.id}: schedule "${source.schedule}" sends ${planned} requests a day (${source.requests.length} requests per tick), over maxRequestsPerDay ${quota}`
			);
		}
		problems.push(..._requestProblems(source, adapter, file.assets));
	}
	if (problems.length > 0) {
		throw new Error(`Invalid signal registry: ${problems.join("; ")}`);
	}
	return {
		assets: new Map(file.assets.map((asset) => [asset.id, asset])),
		sources,
	};
}

/**
 * `SIGNAL_REGISTRY_FILE` (K8s ConfigMap, compose bind mount) replaces the copy
 * bundled in the image, so a new asset needs no image release (issue #1308).
 * Read once at startup: a broken file stops this pod, the previous ones keep serving.
 */
export function loadSignalRegistry(path = process.env.SIGNAL_REGISTRY_FILE) {
	return parseSignalRegistry(
		path ? JSON.parse(readFileSync(path, "utf8")) : REGISTRY_FILE
	);
}

export const SIGNAL_REGISTRY = loadSignalRegistry();
