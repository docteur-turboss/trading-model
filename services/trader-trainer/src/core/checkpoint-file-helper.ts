import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "@trading-model/common/config/logger";

import type { LamarckGenome } from "./genetic-algorithm/genome-types";
import type { DeepReadonly } from "./genetic-algorithm/shared-types";

export class CheckpointFileHelper {
	constructor(private readonly _checkpointDir: string) {}
	checkpointPath(symbol: string): string {
		return join(this._checkpointDir, `best_genome_${symbol}.json`);
	}
	metadataPath(symbol: string): string {
		return join(this._checkpointDir, `metadata_${symbol}.json`);
	}
	doSave(symbol: string, genome: DeepReadonly<LamarckGenome>): void {
		const path = this.checkpointPath(symbol);
		writeFileSync(path, JSON.stringify(genome, null, 2), "utf-8");
		this.writeMetadata(symbol, genome);
		logger.info("Checkpoint saved", {
			context: { symbol, generation: genome.generation, path },
		});
	}
	writeMetadata(symbol: string, genome: DeepReadonly<LamarckGenome>): void {
		writeFileSync(
			this.metadataPath(symbol),
			JSON.stringify({
				savedAt: Date.now(),
				symbol,
				generation: genome.generation,
				fitness: genome.fitness,
			}),
			"utf-8"
		);
	}
	doLoad(symbol: string): DeepReadonly<LamarckGenome> | null {
		const path = this.checkpointPath(symbol);
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
	listMetadataFiles(): string[] {
		return readdirSync(this._checkpointDir).filter((file) =>
			file.startsWith("metadata_")
		);
	}
	readSingleMetadataFile(file: string): {
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
	readMetadataFiles(files: string[]): {
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
			const meta = this.readSingleMetadataFile(file);
			if (meta) {
				results.push(meta);
			}
		}
		return results;
	}
}
