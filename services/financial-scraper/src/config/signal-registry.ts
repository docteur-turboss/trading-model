import cron from "node-cron";
import { z } from "zod";
import { SOURCE_ADAPTERS } from "../adapters/outbound/signal-sources/source-adapters";
import type { SourceAdapter } from "../domain/ports/signal-source.port";
import {
	Asset,
	DATE_PLACEHOLDER,
	SIGNAL_SCHEMA_VERSION,
	Source,
	type SourceRequest,
} from "../domain/signals";
import REGISTRY_FILE from "./signal-registry.json";

/** The source registry (`signal-registry.json`, ADR-0036), checked. */
export interface SignalRegistry {
	assets: ReadonlyMap<string, Asset>;
	sources: readonly Source[];
}

const RegistryFile = z.strictObject({
	schemaVersion: z.literal(SIGNAL_SCHEMA_VERSION),
	assets: z.array(Asset).min(1),
	sources: z.array(Source),
});

function _duplicates(ids: readonly string[]): string[] {
	return ids.filter((id, index) => ids.indexOf(id) !== index);
}

/** The assets a request is about: its asset, or every asset of its sector. */
function _subjectAssets(
	request: SourceRequest,
	assets: readonly Asset[]
): Asset[] {
	const { subject } = request;
	return "assetId" in subject
		? assets.filter((asset) => asset.id === subject.assetId)
		: assets.filter((asset) => asset.sector === subject.sector);
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
					: `${where}: no asset in sector ${subject.sector}`
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
			problems.push(`${where}: URL placeholder other than {date-N}`);
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
	];
	for (const source of file.sources) {
		const adapter = SOURCE_ADAPTERS.get(source.adapter);
		if (!adapter) {
			problems.push(`source ${source.id}: unknown adapter ${source.adapter}`);
		}
		if (!cron.validate(source.schedule)) {
			problems.push(
				`source ${source.id}: invalid schedule "${source.schedule}"`
			);
		}
		problems.push(..._requestProblems(source, adapter, file.assets));
	}
	if (problems.length > 0) {
		throw new Error(`Invalid signal registry: ${problems.join("; ")}`);
	}
	return {
		assets: new Map(file.assets.map((asset) => [asset.id, asset])),
		sources: file.sources,
	};
}

export const SIGNAL_REGISTRY = parseSignalRegistry(REGISTRY_FILE);
