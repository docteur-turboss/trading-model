import { createHash } from "node:crypto";
import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import {
	buildModelManifest,
	MANIFEST_FILE,
	MODEL_SYMBOL_PATTERN,
	MODEL_VERSION_PATTERN,
	type ModelManifest,
	type ModelSummary,
	modelVersion,
	type NewModelArtifact,
	summarizeModel,
	WEIGHTS_FILE,
} from "../../domain/model-artifact";
import type { ModelArtifactStorePort } from "../../domain/ports/model-artifact-store.port";

const TMP_PREFIX = ".tmp-";
/** A temporary directory older than this was left by a crash mid-write. */
const STALE_TMP_MS = 60 * 60 * 1000;

export interface FileModelArtifactStoreOptions {
	/** `TRAINER_MODEL_DIR`: one directory per symbol, one per version. */
	root: string;
	/** Versions kept per symbol (`TRAINER_MODEL_RETENTION`). */
	retention: number;
	now?: () => Date;
}

/** Weights as float32 little-endian, whatever the platform's byte order. */
function toLittleEndian(weights: Float32Array): Buffer {
	const bytes = Buffer.alloc(weights.length * 4);
	for (let i = 0; i < weights.length; i++) {
		bytes.writeFloatLE(weights[i], i * 4);
	}
	return bytes;
}

function isMissing(err: unknown): boolean {
	return (err as NodeJS.ErrnoException)?.code === "ENOENT";
}

/**
 * Model artifacts on a filesystem that outlives the trainer pod (the
 * ReadWriteMany checkpoint volume, ADR-0022). A version is written in a
 * temporary directory and renamed into place: readers never see a partial
 * artifact, and a version is never overwritten.
 */
export class FileModelArtifactStore implements ModelArtifactStorePort {
	private readonly _now: () => Date;

	constructor(private readonly _options: FileModelArtifactStoreOptions) {
		this._now = _options.now ?? (() => new Date());
	}

	async save(artifact: NewModelArtifact): Promise<ModelSummary> {
		const symbolDir = this._symbolDir(artifact.symbol);
		if (!symbolDir) {
			throw new RangeError(`Invalid model symbol "${artifact.symbol}"`);
		}
		const bytes = toLittleEndian(artifact.weights);
		const sha256 = createHash("sha256").update(bytes).digest("hex");
		const createdAt = this._now();
		const version = modelVersion(createdAt, sha256);
		const manifest = buildModelManifest(artifact, {
			version,
			createdAt,
			sha256,
		});

		await mkdir(symbolDir, { recursive: true });
		const target = join(symbolDir, version);
		const tmp = await mkdtemp(join(symbolDir, TMP_PREFIX));
		try {
			await writeFile(join(tmp, WEIGHTS_FILE), bytes);
			await writeFile(
				join(tmp, MANIFEST_FILE),
				`${JSON.stringify(manifest, null, 2)}\n`
			);
			await this._moveIntoPlace(tmp, target);
		} finally {
			await rm(tmp, { recursive: true, force: true });
		}
		await this._prune(symbolDir);
		return summarizeModel(manifest);
	}

	async list(symbol: string): Promise<ModelSummary[]> {
		const symbolDir = this._symbolDir(symbol);
		if (!symbolDir) {
			return [];
		}
		const manifests = await Promise.all(
			(await this._versions(symbolDir)).map((version) =>
				this.manifest(symbol, version)
			)
		);
		return manifests
			.filter((manifest): manifest is ModelManifest => manifest !== undefined)
			.map(summarizeModel);
	}

	async manifest(
		symbol: string,
		version: string
	): Promise<ModelManifest | undefined> {
		const json = await this._read(symbol, version, MANIFEST_FILE);
		return json
			? (JSON.parse(json.toString("utf8")) as ModelManifest)
			: undefined;
	}

	async weights(
		symbol: string,
		version: string
	): Promise<Uint8Array | undefined> {
		return await this._read(symbol, version, WEIGHTS_FILE);
	}

	/** `undefined` for a name that is not a valid symbol: no path escapes the root. */
	private _symbolDir(symbol: string): string | undefined {
		return MODEL_SYMBOL_PATTERN.test(symbol)
			? join(this._options.root, symbol)
			: undefined;
	}

	private async _read(
		symbol: string,
		version: string,
		file: string
	): Promise<Buffer | undefined> {
		const symbolDir = this._symbolDir(symbol);
		if (!(symbolDir && MODEL_VERSION_PATTERN.test(version))) {
			return;
		}
		try {
			return await readFile(join(symbolDir, version, file));
		} catch (err) {
			if (isMissing(err)) {
				return;
			}
			throw err;
		}
	}

	/** Another replica may have written the same version (same weights, same second). */
	private async _moveIntoPlace(tmp: string, target: string): Promise<void> {
		try {
			await stat(target);
			return;
		} catch (err) {
			if (!isMissing(err)) {
				throw err;
			}
		}
		await rename(tmp, target);
	}

	/** Versions of a symbol directory, newest first. */
	private async _versions(symbolDir: string): Promise<string[]> {
		try {
			const names = await readdir(symbolDir);
			return names
				.filter((name) => MODEL_VERSION_PATTERN.test(name))
				.sort()
				.reverse();
		} catch (err) {
			if (isMissing(err)) {
				return [];
			}
			throw err;
		}
	}

	/** `undefined` once another replica renamed or removed it meanwhile. */
	private async _modifiedAt(path: string): Promise<number | undefined> {
		try {
			return (await stat(path)).mtimeMs;
		} catch (err) {
			if (isMissing(err)) {
				return;
			}
			throw err;
		}
	}

	/** Keeps the newest versions, and removes what a crash mid-write left. */
	private async _prune(symbolDir: string): Promise<void> {
		const versions = await this._versions(symbolDir);
		for (const version of versions.slice(this._options.retention)) {
			await rm(join(symbolDir, version), { recursive: true, force: true });
		}
		const now = this._now().getTime();
		for (const name of await readdir(symbolDir)) {
			if (!name.startsWith(TMP_PREFIX)) {
				continue;
			}
			const path = join(symbolDir, name);
			const modified = await this._modifiedAt(path);
			if (modified !== undefined && now - modified > STALE_TMP_MS) {
				await rm(path, { recursive: true, force: true });
			}
		}
	}
}
