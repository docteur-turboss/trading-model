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

export interface GenomeCheckpointStoreConfig {
	checkpointDir: string;
	maxCheckpoints?: number;
}

export class GenomeCheckpointStore {
	private readonly _checkpointDir: string;
	private readonly _maxCheckpoints: number;

	constructor(config: GenomeCheckpointStoreConfig) {
		this._checkpointDir = config.checkpointDir;
		this._maxCheckpoints = config.maxCheckpoints ?? 5;

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
			const path = this._checkpointPath(symbol);
			writeFileSync(path, JSON.stringify(genome, null, 2), "utf-8");
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
			logger.info("Checkpoint saved", {
				context: {
					symbol,
					generation: genome.generation,
					path,
				},
			});
		} catch (err) {
			logger.error("Failed to save checkpoint", {
				context: {
					symbol,
					error: err instanceof Error ? err.message : String(err),
				},
			});
		}
	}

	load(symbol: string): DeepReadonly<LamarckGenome> | null {
		try {
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
		} catch (err) {
			logger.error("Failed to load checkpoint", {
				context: {
					symbol,
					error: err instanceof Error ? err.message : String(err),
				},
			});
			return null;
		}
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
		const files = readdirSync(this._checkpointDir).filter((file) =>
			file.startsWith("metadata_")
		);
		return this._readMetadataFiles(files)
			.sort((_prev, _next) => _next.savedAt - _prev.savedAt)
			.slice(0, this._maxCheckpoints);
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
			try {
				const raw = readFileSync(join(this._checkpointDir, file), "utf-8");
				const meta = JSON.parse(raw);
				results.push({
					symbol: meta.symbol,
					generation: meta.generation,
					fitness: meta.fitness,
					savedAt: meta.savedAt,
				});
			} catch {
				/* skip unreadable */
			}
		}
		return results;
	}
}
