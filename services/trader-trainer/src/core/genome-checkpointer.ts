import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { logger } from "@trading-model/common/config/logger";

import type { LamarckGenome } from "./genetic-algorithm/genome-types";
import type { DeepReadonly } from "./genetic-algorithm/shared-types";

export class GenomeCheckpointer {
	constructor(
		private readonly _checkpointDir: string,
		private readonly _maxCheckpoints: number
	) {
		if (!existsSync(this._checkpointDir)) {
			mkdirSync(this._checkpointDir, { recursive: true });
			logger.info("Created checkpoint directory", {
				context: { dir: this._checkpointDir },
			});
		}
	}

	private _checkpointPath(symbol: string): string {
		return join(this._checkpointDir, `best_genome_${symbol}.json`);
	}

	private _metadataPath(symbol: string): string {
		return join(this._checkpointDir, `metadata_${symbol}.json`);
	}

	save(symbol: string, genome: DeepReadonly<LamarckGenome>): void {
		try {
			this._doSave(symbol, genome);
		} catch (err) {
			this._logSaveError(symbol, err);
		}
	}

	private _doSave(symbol: string, genome: DeepReadonly<LamarckGenome>): void {
		const path = this._checkpointPath(symbol);
		writeFileSync(path, JSON.stringify(genome, null, 2), "utf-8");
		this._writeMetadata(symbol, genome);
		logger.info("Checkpoint saved", {
			context: { symbol, generation: genome.generation, path },
		});
	}

	private _writeMetadata(
		symbol: string,
		genome: DeepReadonly<LamarckGenome>
	): void {
		writeFileSync(
			this._metadataPath(symbol),
			JSON.stringify({
				savedAt: Date.now(),
				symbol,
				generation: genome.generation,
				fitness: genome.fitness,
			}),
			"utf-8"
		);
	}

	private _logSaveError(symbol: string, err: unknown): void {
		logger.error("Failed to save checkpoint", {
			context: {
				symbol,
				error: err instanceof Error ? err.message : String(err),
			},
		});
	}

	load(symbol: string): DeepReadonly<LamarckGenome> | null {
		try {
			return this._doLoad(symbol);
		} catch (err) {
			this._logLoadError(symbol, err);
			return null;
		}
	}

	private _doLoad(symbol: string): DeepReadonly<LamarckGenome> | null {
		const path = this._checkpointPath(symbol);
		if (!existsSync(path)) {
			logger.info("No checkpoint found for symbol", { context: { symbol } });
			return null;
		}
		const raw = readFileSync(path, "utf-8");
		const genome = JSON.parse(raw) as DeepReadonly<LamarckGenome>;
		logger.info("Checkpoint loaded", {
			context: {
				symbol,
				generation: genome.generation,
				fitness: genome.fitness,
			},
		});
		return genome;
	}

	private _logLoadError(symbol: string, err: unknown): void {
		logger.error("Failed to load checkpoint", {
			context: {
				symbol,
				error: err instanceof Error ? err.message : String(err),
			},
		});
	}

	list(): {
		symbol: string;
		generation: number;
		fitness: number;
		savedAt: number;
	}[] {
		if (!existsSync(this._checkpointDir)) {
			return [];
		}
		const files = this._listMetadataFiles();
		return this._readMetadataFiles(files)
			.sort((prev, next) => next.savedAt - prev.savedAt)
			.slice(0, this._maxCheckpoints);
	}

	private _listMetadataFiles(): string[] {
		return readdirSync(this._checkpointDir).filter((file) =>
			file.startsWith("metadata_")
		);
	}

	private _readSingleMetadataFile(file: string): {
		symbol: string;
		generation: number;
		fitness: number;
		savedAt: number;
	} | null {
		try {
			const raw = readFileSync(join(this._checkpointDir, file), "utf-8");
			const meta = JSON.parse(raw);
			return {
				symbol: meta.symbol,
				generation: meta.generation,
				fitness: meta.fitness,
				savedAt: meta.savedAt,
			};
		} catch {
			return null;
		}
	}

	private _readMetadataFiles(files: string[]): {
		symbol: string;
		generation: number;
		fitness: number;
		savedAt: number;
	}[] {
		const results: {
			symbol: string;
			generation: number;
			fitness: number;
			savedAt: number;
		}[] = [];
		for (const file of files) {
			const meta = this._readSingleMetadataFile(file);
			if (meta) {
				results.push(meta);
			}
		}
		return results;
	}
}
