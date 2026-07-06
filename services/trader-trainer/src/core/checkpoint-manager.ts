import {
	existsSync,
	mkdirSync,
} from "node:fs";
import { logger } from "@trading-model/common/config/logger";

import type { LamarckGenome } from "./genetic-algorithm/genome-types";
import type { DeepReadonly } from "./genetic-algorithm/shared-types";
import {
	MarketDataBuffer,
	type MarketDataBufferConfig,
} from "./market-data-buffer";
import { BufferCheckpointer } from "./buffer-checkpointer";
import { GenomeCheckpointer } from "./genome-checkpointer";

export interface CheckpointManagerConfig {
	checkpointDir: string;
	maxCheckpoints?: number;
}

export class CheckpointManager {
	private readonly _checkpointDir: string;
	private readonly _maxCheckpoints: number;
	private readonly _genomeCheckpointer: GenomeCheckpointer;
	private readonly _bufferCheckpointer: BufferCheckpointer;

	constructor(config: CheckpointManagerConfig) {
		this._checkpointDir = config.checkpointDir;
		this._maxCheckpoints = config.maxCheckpoints ?? 5;

		if (!existsSync(this._checkpointDir)) {
			mkdirSync(this._checkpointDir, { recursive: true });
			logger.info("Created checkpoint directory", { context: { dir: this._checkpointDir } });
		}

		this._genomeCheckpointer = new GenomeCheckpointer(
			this._checkpointDir,
			this._maxCheckpoints,
		);
		this._bufferCheckpointer = new BufferCheckpointer(this._checkpointDir);
	}

	save(symbol: string, genome: DeepReadonly<LamarckGenome>): void {
		this._genomeCheckpointer.save(symbol, genome);
	}

	load(symbol: string): DeepReadonly<LamarckGenome> | null {
		return this._genomeCheckpointer.load(symbol);
	}

	list(): {
		symbol: string;
		generation: number;
		fitness: number;
		savedAt: number;
	}[] {
		return this._genomeCheckpointer.list();
	}

	saveBuffer(buffer: MarketDataBuffer): void {
		this._bufferCheckpointer.save(buffer);
	}

	loadBuffer(config?: MarketDataBufferConfig): MarketDataBuffer | null {
		return this._bufferCheckpointer.load(config);
	}
}
