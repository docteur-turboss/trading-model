import type { WindowSet } from "./genetic-algorithm/ga-runner";
import {
	type MarketDataBuffer,
	MIN_TRAINING_STEPS,
} from "./market-data-buffer";
import type { TradingSymbol } from "./market-data-types";
import type { TrainingFailure } from "./training-types";

export interface WindowingSettings {
	validationSplit: number;
	walkForwardFolds: number;
}

export function validateTrainingPrerequisites(
	dataBuffer: MarketDataBuffer,
	isTraining: () => boolean,
	symbol: TradingSymbol,
	windowing: WindowingSettings
):
	| { ok: true; windowSets: WindowSet[] }
	| { ok: false; error: TrainingFailure } {
	if (isTraining()) {
		return {
			ok: false,
			error: { success: false, symbol, error: new Error("Already training") },
		};
	}
	const result = dataBuffer.getAllWindows(
		symbol,
		windowing.validationSplit,
		windowing.walkForwardFolds
	);
	if (!result) {
		return {
			ok: false,
			error: {
				success: false,
				symbol,
				error: new Error(
					`Not enough data for ${symbol}, need at least ${MIN_TRAINING_STEPS} steps`
				),
			},
		};
	}
	const windowSets: WindowSet[] = Array.isArray(result) ? result : [result];
	const hasInsufficientTrain = windowSets.some(
		(ws) => ws.train.length < MIN_TRAINING_STEPS
	);
	if (hasInsufficientTrain) {
		return {
			ok: false,
			error: {
				success: false,
				symbol,
				error: new Error(
					`Not enough data for ${symbol}, need at least ${MIN_TRAINING_STEPS} steps per training window`
				),
			},
		};
	}
	return { ok: true, windowSets };
}
