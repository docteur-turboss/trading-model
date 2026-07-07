import { existsSync, mkdirSync } from "node:fs";
import { logger } from "@trading-model/common/config/logger";
import type { TradingSymbol, UnixTimestamp } from "@trading-model/common/domain/primitives";
import { BufferLoader } from "./buffer-loader";
import { BufferSaver } from "./buffer-saver";
import { CheckpointFileHelper, type CheckpointMetadata } from "./checkpoint-file-helper";
import type { LamarckGenome } from "./genetic-algorithm/genome-types";
import type { DeepReadonly } from "./genetic-algorithm/shared-types";
import type {
	MarketDataBuffer,
	MarketDataBufferConfig,
} from "./market-data-buffer";

export interface CheckpointManagerConfig {
	checkpointDir: string;
	maxCheckpoints?: number;
}

export class CheckpointManager {
	private readonly _checkpointDir: string;
	private readonly _maxCheckpoints: number;
	private readonly _fileHelper: CheckpointFileHelper;
	private readonly _bufferSaver: BufferSaver;
	private readonly _bufferLoader: BufferLoader;

	constructor(config: CheckpointManagerConfig) {
		this._checkpointDir = config.checkpointDir;
		this._maxCheckpoints = config.maxCheckpoints ?? 5;

		if (!existsSync(this._checkpointDir)) {
			mkdirSync(this._checkpointDir, { recursive: true });
			logger.info("Created checkpoint directory", {
				context: { dir: this._checkpointDir },
			});
		}

		this._fileHelper = new CheckpointFileHelper(this._checkpointDir);
		this._bufferSaver = new BufferSaver(this._checkpointDir);
		this._bufferLoader = new BufferLoader(this._checkpointDir);
	}

	save(symbol: TradingSymbol, genome: DeepReadonly<LamarckGenome>): void {
		try {
			this._fileHelper.save(symbol, genome);
		} catch (err) {
			logger.error("Failed to save checkpoint", {
				context: {
					symbol,
					error: err instanceof Error ? err.message : String(err),
				},
			});
		}
	}

	load(symbol: TradingSymbol): DeepReadonly<LamarckGenome> | null {
		try {
			return this._fileHelper.load(symbol);
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

	list(): CheckpointMetadata[] {
		if (!existsSync(this._checkpointDir)) {
			return [];
		}
		const files = this._fileHelper.listMetadataFiles();
		return this._fileHelper
			.readMetadataFiles(files)
			.sort((prev, next) => next.savedAt - prev.savedAt)
			.slice(0, this._maxCheckpoints);
	}

	saveBuffer(buffer: MarketDataBuffer): void {
		this._bufferSaver.save(buffer);
	}

	loadBuffer(config?: MarketDataBufferConfig): MarketDataBuffer | null {
		return this._bufferLoader.load(config);
	}
}
