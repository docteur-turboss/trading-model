import type {
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
	toJson(genome: DeepReadonly<LamarckGenome>): string {
		return JSON.stringify(genome, null, 2);
	}

	fromJson<TValue>(raw: string): TValue {
		return JSON.parse(raw) as TValue;
	}

	buildMetadata(target: CheckpointTarget, fitness = 0): CheckpointMetadata {
		return {
			savedAt: Date.now() as UnixTimestamp,
			symbol: target.symbol,
			generation:
				(target.genome.generation as unknown as number | undefined) ?? 0,
			fitness,
		};
	}

	parseMetadata(raw: string): CheckpointMetadata | null {
		try {
			const meta = JSON.parse(raw);
			return {
				symbol: meta.symbol as TradingSymbol,
				generation: meta.generation,
				fitness: meta.fitness,
				savedAt: meta.savedAt as UnixTimestamp,
			};
		} catch {
			return null;
		}
	}
}
