import { join } from "node:path";
import { logger } from "@trading-model/common/config/logger";
import type { TradingSymbol } from "@trading-model/common/domain/primitives";
import type { LamarckGenome } from "./genetic-algorithm/genome-types";
import type { DeepReadonly } from "./genetic-algorithm/shared-types";
import { CheckpointSerializer, type CheckpointMetadata, type CheckpointTarget } from "./checkpoint-serializer";
import { NodeCheckpointIO, type CheckpointIO } from "./checkpoint-io";

export type { CheckpointMetadata, CheckpointTarget } from "./checkpoint-serializer";
export { CheckpointSerializer } from "./checkpoint-serializer";
export { NodeCheckpointIO, type CheckpointIO } from "./checkpoint-io";

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

	checkpointPath(symbol: TradingSymbol): string {
		return join(this._checkpointDir, `best_genome_${symbol}.json`);
	}

	metadataPath(symbol: TradingSymbol): string {
		return join(this._checkpointDir, `metadata_${symbol}.json`);
	}

	save(target: CheckpointTarget): void {
		const path = this.checkpointPath(target.symbol);
		this._io.writeFile(path, this._serializer.toJson(target.genome));
		this._writeMetadata(target);
		logger.info("Checkpoint saved", {
			context: { symbol: target.symbol, generation: target.genome.generation, path },
		});
	}

	private _writeMetadata(target: CheckpointTarget): void {
		const meta = this._serializer.buildMetadata(target);
		this._io.writeFile(this.metadataPath(target.symbol), JSON.stringify(meta));
	}

	load(symbol: TradingSymbol): DeepReadonly<LamarckGenome> | null {
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
				fitness: (genome as Record<string, unknown>).fitness ?? 0,
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
