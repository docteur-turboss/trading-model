import { join } from "node:path";
import { logger } from "@trading-model/common/config/logger";
import type { TradingSymbol } from "@trading-model/common/domain/primitives";
import { type CheckpointIO, NodeCheckpointIO } from "./checkpoint-io";
import { CheckpointPathResolver } from "./checkpoint-path-resolver";
import {
	type CheckpointMetadata,
	CheckpointSerializer,
	type CheckpointTarget,
} from "./checkpoint-serializer";
import type { LamarckGenome } from "./genetic-algorithm/genome-types";
import type { DeepReadonly } from "./genetic-algorithm/shared-types";

export { type CheckpointIO, NodeCheckpointIO } from "./checkpoint-io";
export type {
	CheckpointMetadata,
	CheckpointTarget,
} from "./checkpoint-serializer";
export { CheckpointSerializer } from "./checkpoint-serializer";

export class CheckpointFileHelper {
	private readonly _io: CheckpointIO;
	private readonly _serializer: CheckpointSerializer;
	private readonly _pathResolver: CheckpointPathResolver;

	constructor(
		checkpointDir: string,
		io?: CheckpointIO,
		serializer?: CheckpointSerializer
	) {
		this._io = io ?? new NodeCheckpointIO();
		this._serializer = serializer ?? new CheckpointSerializer();
		this._pathResolver = new CheckpointPathResolver(checkpointDir);
	}

	save(target: CheckpointTarget): void {
		const path = this._pathResolver.checkpointPath(target.symbol);
		this._io.writeFile(path, this._serializer.serialize(target.genome));
		this._writeMetadata(target);
		logger.info("Checkpoint saved", {
			context: {
				symbol: target.symbol,
				generation: target.genome.generation,
				path,
			},
		});
	}

	private _writeMetadata(target: CheckpointTarget): void {
		const meta = this._serializer.buildMetadata(target);
		this._io.writeFile(
			this._pathResolver.metadataPath(target.symbol),
			JSON.stringify(meta)
		);
	}

	load(symbol: TradingSymbol): DeepReadonly<LamarckGenome> | null {
		const path = this._pathResolver.checkpointPath(symbol);
		if (!this._io.fileExists(path)) {
			logger.info("No checkpoint found for symbol", { context: { symbol } });
			return null;
		}
		const raw = this._io.readFile(path);
		const genome =
			this._serializer.deserialize<DeepReadonly<LamarckGenome>>(raw);
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
		return readdirSync(this._pathResolver.getDirectory()).filter(
			(file: string) => file.startsWith("metadata_")
		);
	}

	readSingleMetadataFile(file: string): CheckpointMetadata | null {
		try {
			const raw = this._io.readFile(
				join(this._pathResolver.getDirectory(), file)
			);
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
