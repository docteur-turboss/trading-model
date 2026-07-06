import { existsSync, mkdirSync } from "node:fs";
import { logger } from "@trading-model/common/config/logger";
import { CheckpointFileHelper } from "./checkpoint-file-helper";
import type { LamarckGenome } from "./genetic-algorithm/genome-types";
import type { DeepReadonly } from "./genetic-algorithm/shared-types";

export class GenomeCheckpointer {
	private readonly _fileHelper = new CheckpointFileHelper(this._checkpointDir);

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

	save(symbol: string, genome: DeepReadonly<LamarckGenome>): void {
		try {
			this._fileHelper.doSave(symbol, genome);
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
			return this._fileHelper.doLoad(symbol);
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
		const files = this._fileHelper.listMetadataFiles();
		return this._fileHelper
			.readMetadataFiles(files)
			.sort((prev, next) => next.savedAt - prev.savedAt)
			.slice(0, this._maxCheckpoints);
	}
}
