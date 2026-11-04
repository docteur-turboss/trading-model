import cron from "node-cron";
import { z } from "zod";
import { SOURCE_ADAPTERS } from "../adapters/outbound/signal-sources/source-adapters";
import type { SourceAdapter } from "../domain/ports/signal-source.port";
import { Asset, SIGNAL_SCHEMA_VERSION, Source } from "../domain/signals";
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

function _requestProblems(
	source: Source,
	adapter: SourceAdapter | undefined,
	assets: ReadonlyMap<string, Asset>,
	sectors: ReadonlySet<string>
): string[] {
	return source.requests.flatMap((request, index) => {
		const where = `source ${source.id}, request ${index}`;
		const { subject } = request;
		const problems: string[] = [];
		if ("assetId" in subject && !assets.has(subject.assetId)) {
			problems.push(`${where}: unknown asset ${subject.assetId}`);
		}
		if ("sector" in subject && !sectors.has(subject.sector)) {
			problems.push(`${where}: no asset in sector ${subject.sector}`);
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
 * known subjects and adapters, valid schedules, adapter params. Throws with
 * every problem found, so a broken registry stops the service at startup.
 */
export function parseSignalRegistry(
	raw: unknown,
	adapters: ReadonlyMap<string, SourceAdapter> = SOURCE_ADAPTERS
): SignalRegistry {
	const file = RegistryFile.parse(raw);
	const assets = new Map(file.assets.map((asset) => [asset.id, asset]));
	const sectors = new Set(file.assets.map((asset) => asset.sector));
	const problems = [
		..._duplicates(file.assets.map((asset) => asset.id)).map(
			(id) => `asset ${id} declared twice`
		),
		..._duplicates(file.sources.map((source) => source.id)).map(
			(id) => `source ${id} declared twice`
		),
	];
	for (const source of file.sources) {
		const adapter = adapters.get(source.adapter);
		if (!adapter) {
			problems.push(`source ${source.id}: unknown adapter ${source.adapter}`);
		}
		if (!cron.validate(source.schedule)) {
			problems.push(
				`source ${source.id}: invalid schedule "${source.schedule}"`
			);
		}
		problems.push(..._requestProblems(source, adapter, assets, sectors));
	}
	if (problems.length > 0) {
		throw new Error(`Invalid signal registry: ${problems.join("; ")}`);
	}
	return { assets, sources: file.sources };
}

export const SIGNAL_REGISTRY = parseSignalRegistry(REGISTRY_FILE);
