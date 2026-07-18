import { join } from "node:path";
import type { TradingSymbol } from "@trading-model/common/domain/primitives";

export class CheckpointPathResolver {
	constructor(private readonly _checkpointDir: string) {}

	checkpointPath(symbol: TradingSymbol): string {
		return join(this._checkpointDir, `best_genome_${symbol}.json`);
	}

	metadataPath(symbol: TradingSymbol): string {
		return join(this._checkpointDir, `metadata_${symbol}.json`);
	}

	getDirectory(): string {
		return this._checkpointDir;
	}
}
