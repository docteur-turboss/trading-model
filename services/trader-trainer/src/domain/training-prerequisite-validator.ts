import type { CandleData } from "@trading-model/contracts/market-data.types";
import type { WindowSet } from "./genetic-algorithm/ga-runner";
import { hasEnoughTrainingData } from "./market-data/window-splitter";
import {
	type MarketDataBuffer,
	MIN_TRAINING_STEPS,
} from "./market-data-buffer";
import type { TradingSymbol } from "./market-data-types";
import type { TrainingFailure } from "./training-types";

interface WindowingSettings {
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
	const fail = (message: string) => ({
		ok: false as const,
		error: { success: false as const, symbol, error: new Error(message) },
	});
	if (isTraining()) {
		return fail("Already training");
	}
	const candles = dataBuffer.getSymbolState(symbol)?.candles ?? [];
	if (!isStrictlyIncreasing(candles)) {
		// A repeated candle would sit in both a training and a validation window
		// and inflate the out-of-sample metrics: refuse rather than train on it.
		return fail(
			`Candle series for ${symbol} has duplicated or out-of-order timestamps`
		);
	}
	const result = hasEnoughTrainingData(
		candles.length,
		windowing.validationSplit,
		windowing.walkForwardFolds
	)
		? dataBuffer.getAllWindows(
				symbol,
				windowing.validationSplit,
				windowing.walkForwardFolds
			)
		: null;
	if (!result) {
		return fail(
			`Not enough data for ${symbol}, need at least ${MIN_TRAINING_STEPS} steps`
		);
	}
	const windowSets: WindowSet[] = Array.isArray(result) ? result : [result];
	const hasInsufficientTrain = windowSets.some(
		(ws) => ws.train.length < MIN_TRAINING_STEPS
	);
	if (hasInsufficientTrain) {
		return fail(
			`Not enough data for ${symbol}, need at least ${MIN_TRAINING_STEPS} steps per training window`
		);
	}
	return { ok: true, windowSets };
}

function isStrictlyIncreasing(candles: CandleData[]): boolean {
	return candles.every(
		(candle, idx) => idx === 0 || candle.timestamp > candles[idx - 1].timestamp
	);
}
