import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "@trading-model/common/config/logger";

import type { LamarckGenome } from "./genetic-algorithm/genome-types";
import type { DeepReadonly } from "./genetic-algorithm/shared-types";

export interface CheckpointMetadata {
	symbol: string;
	generation: number;
	fitness: number;
	savedAt: number;
}

export interface CheckpointIO {
	readFile(path: string): string;
	writeFile(path: string, data: string): void;
	fileExists(path: string): boolean;
}

export class NodeCheckpointIO implements CheckpointIO {
	readFile(path: string): string {
		return readFileSync(path, "utf-8");
	}
	writeFile(path: string, data: string): void {
		writeFileSync(path, data, "utf-8");
	}
	fileExists(path: string): boolean {
		return existsSync(path);
	}
}

export class CheckpointSerializer {
	toJson(genome: DeepReadonly<LamarckGenome>): string {
		return JSON.stringify(genome, null, 2);
	}

	fromJson<T>(raw: string): T {
		return JSON.parse(raw) as T;
	}

	buildMetadata(
		symbol: string,
		genome: DeepReadonly<LamarckGenome>
	): CheckpointMetadata {
		return {
			savedAt: Date.now(),
			symbol,
			generation: (genome.generation as number | undefined) ?? 0,
			fitness: (genome.fitness as number | undefined) ?? 0,
		};
	}

	parseMetadata(raw: string): CheckpointMetadata | null {
		try {
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
}

export class CheckpointFileHelper {
	private readonly _io: CheckpointIO;
	private readonly _serializer: CheckpointSerializer;

	constructor(
		private readonly _checkpointDir: string,
		io?: CheckpointIO,
		serializer?: CheckpointSerializer
	) {
		this._io = io ?? new NodeCheckpointIO();
		this._serializer = serializer ?? new CheckpointSerializer();
	}

	checkpointPath(symbol: string): string {
		return join(this._checkpointDir, `best_genome_${symbol}.json`);
	}

	metadataPath(symbol: string): string {
		return join(this._checkpointDir, `metadata_${symbol}.json`);
	}

	save(symbol: string, genome: DeepReadonly<LamarckGenome>): void {
		const path = this.checkpointPath(symbol);
		this._io.writeFile(path, this._serializer.toJson(genome));
		this._writeMetadata(symbol, genome);
		logger.info("Checkpoint saved", {
			context: { symbol, generation: genome.generation, path },
		});
	}

	private _writeMetadata(
		symbol: string,
		genome: DeepReadonly<LamarckGenome>
	): void {
		const meta = this._serializer.buildMetadata(symbol, genome);
		this._io.writeFile(this.metadataPath(symbol), JSON.stringify(meta));
	}

	load(symbol: string): DeepReadonly<LamarckGenome> | null {
		const path = this.checkpointPath(symbol);
		if (!this._io.fileExists(path)) {
			logger.info("No checkpoint found for symbol", { context: { symbol } });
			return null;
		}
		const raw = this._io.readFile(path);
		const genome =
			this._serializer.fromJson<DeepReadonly<LamarckGenome>>(raw);
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
		const { readdirSync } = require("node:fs") as typeof import("node:fs");
		return readdirSync(this._checkpointDir).filter((file: string) =>
			file.startsWith("metadata_")
		);
	}

	readSingleMetadataFile(file: string): CheckpointMetadata | null {
		try {
			const raw = this._io.readFile(join(this._checkpointDir, file));
			return this._serializer.parseMetadata(raw);
		} catch {
			return null;
		}
	}

	readMetadataFiles(files: string[]): CheckpointMetadata[] {
		const results: CheckpointMetadata[] = [];
		for (const file of files) {
			const meta = this.readSingleMetadataFile(file);
			if (meta) {
				results.push(meta);
			}
		}
		return results;
	}
}
