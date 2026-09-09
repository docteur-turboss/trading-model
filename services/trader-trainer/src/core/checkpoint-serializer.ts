import {
	TradingSymbol,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import type { LamarckGenome } from "./genetic-algorithm/genome-types";
import type { DeepReadonly } from "./genetic-algorithm/shared-types";

export interface CheckpointTarget {
	symbol: TradingSymbol;
	genome: DeepReadonly<LamarckGenome>;
}

export interface CheckpointMetadata {
	symbol: TradingSymbol;
	generation: number;
	fitness: number;
	savedAt: UnixTimestamp;
}

export class CheckpointSerializer {
	serialize(genome: DeepReadonly<LamarckGenome>): string {
		return JSON.stringify(genome, null, 2);
	}

	deserialize<TValue>(raw: string): TValue {
		return JSON.parse(raw) as TValue;
	}

	buildMetadata(target: CheckpointTarget, fitness = 0): CheckpointMetadata {
		return {
			savedAt: Date.now() as UnixTimestamp,
			symbol: target.symbol,
			generation: target.genome.generation ?? 0,
			fitness,
		};
	}

	parseMetadata(raw: string): CheckpointMetadata | null {
		try {
			const meta = JSON.parse(raw);
			return {
				symbol: TradingSymbol.of(meta.symbol),
				generation: meta.generation as number,
				fitness: meta.fitness as number,
				savedAt: UnixTimestamp.of(meta.savedAt),
			};
		} catch {
			return null;
		}
	}
}
