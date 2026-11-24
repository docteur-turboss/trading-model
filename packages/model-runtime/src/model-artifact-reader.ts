import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type ModelManifestData, ModelManifestSchema } from "./model-manifest";

export const WEIGHTS_FILE = "weights.f32";
export const MANIFEST_FILE = "manifest.json";
/** `<UTC yyyymmddThhmmssZ>-<first 12 hex of the weights sha256>`. */
export const MODEL_VERSION_PATTERN = /^\d{8}T\d{6}Z-[0-9a-f]{12}$/;
/** Symbols are path segments: letters, digits, `.`, `_` and `-` only. */
export const MODEL_SYMBOL_PATTERN = /^[A-Za-z0-9._-]+$/;

/**
 * Bytes of one artifact file of the store the trainer writes (ADR-0022, ADR-0089).
 * `undefined` when the file is absent or the names are not valid path segments;
 * any other error is rethrown.
 */
export async function readModelFile(
	root: string,
	symbol: string,
	version: string,
	file: string
): Promise<Buffer | undefined> {
	if (
		!(MODEL_SYMBOL_PATTERN.test(symbol) && MODEL_VERSION_PATTERN.test(version))
	) {
		return;
	}
	try {
		return await readFile(join(root, symbol, version, file));
	} catch (err) {
		if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
			return;
		}
		throw err;
	}
}

/** Manifest of a version; `undefined` when absent, throws when it fails the shared schema. */
export async function readModelManifest(
	root: string,
	symbol: string,
	version: string
): Promise<ModelManifestData | undefined> {
	const json = await readModelFile(root, symbol, version, MANIFEST_FILE);
	return json
		? ModelManifestSchema.parse(JSON.parse(json.toString("utf8")))
		: undefined;
}
