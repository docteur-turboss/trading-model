import { Percentage, PositiveInt } from "@trading-model/primitives/primitives";
import { buildFeatures as buildFeaturesFn } from "../feature-builder";
import type { WindowSet } from "../genetic-algorithm/generation-types";
import type { MarketStep } from "../genetic-algorithm/genome-types";
import type { SymbolState, TradingSymbol } from "../market-data-types";
import { NormalizationManager } from "../normalization-manager";
import type { MarketDataContext } from "./market-data-context";
import { forEachPointInTime } from "./point-in-time";

/** Minimum number of market steps required before training can start. */
export const MIN_TRAINING_STEPS = PositiveInt.of(10);

/** Default fraction of the steps held out for validation (selection). */
export const DEFAULT_VALIDATION_SPLIT = Percentage.of(0.15);

/**
 * Default fraction of the steps, the newest, held out for the final test: never
 * read by the training nor by the selection (issue #885, ADR-0068).
 */
export const DEFAULT_TEST_SPLIT = Percentage.of(0.15);

/** Default number of walk-forward folds (1 = single split, no rolling). */
const DEFAULT_WALK_FORWARD_FOLDS = 1;

/**
 * Whether `candleCount` candles give windows the training validator accepts.
 * A series of N candles makes N-1 steps. Walk-forward needs MIN_TRAINING_STEPS
 * per fold; otherwise the single split must leave MIN_TRAINING_STEPS to train.
 * The loop and the validator both decide through this rule.
 */
export function hasEnoughTrainingData(
	candleCount: number,
	validationSplit: number,
	walkForwardFolds: number,
	testSplit: number = DEFAULT_TEST_SPLIT
): boolean {
	const steps = candleCount - 1;
	const rest = Math.floor(steps * (1 - testSplit));
	if (steps - rest < MIN_TRAINING_STEPS) {
		return false;
	}
	if (walkForwardFolds >= 2 && rest >= MIN_TRAINING_STEPS * walkForwardFolds) {
		return true;
	}
	// Walk-forward fallback uses DEFAULT_VALIDATION_SPLIT, as splitWalkForward does.
	const split =
		walkForwardFolds >= 2 ? DEFAULT_VALIDATION_SPLIT : validationSplit;
	const train = Math.floor(rest * (1 - split));
	return train >= MIN_TRAINING_STEPS && rest - train >= MIN_TRAINING_STEPS;
}

/** Handles building market steps and train/validation window splitting. */
export class WindowSplitter {
	constructor(
		private readonly _states: Map<TradingSymbol, SymbolState>,
		private readonly _normManager = new NormalizationManager()
	) {}

	/**
	 * One step per candle after the first, built from what its close knew. Its
	 * decision fills at the next candle's open (none for the last candle: it
	 * fills at its close).
	 */
	buildMarketSteps(ctx: MarketDataContext): MarketStep[] {
		const state = this._states.get(ctx.symbol);
		if (!state || state.candles.length < 2) {
			return [];
		}
		const steps: MarketStep[] = [];
		forEachPointInTime(state, this._normManager, (view, idx) => {
			if (idx > 0) {
				steps.push({
					price: view.candles[idx].close,
					fillPrice: state.candles[idx + 1]?.open,
					features: buildFeaturesFn({ state: view, idx }),
					timestamp: view.candles[idx].timestamp,
				});
			}
		});
		return steps;
	}

	private static _nextId = 0;

	splitTrainValidation(
		steps: MarketStep[],
		validationSplit: number
	): { train: MarketStep[]; validation: MarketStep[]; id: string } {
		const splitIdx = Math.floor(steps.length * (1 - validationSplit));
		return {
			id: `window_${++WindowSplitter._nextId}`,
			train: steps.slice(0, splitIdx),
			validation: steps.slice(splitIdx),
		};
	}

	/**
	 * Create expanding-window walk-forward splits.
	 *
	 * Given N folds, produces N-1 WindowSets:
	 *   Window 1: train = fold 0,           validation = fold 1
	 *   Window 2: train = folds 0..1,       validation = fold 2
	 *   ...
	 *   Window N-1: train = folds 0..N-2,   validation = fold N-1
	 *
	 * This ensures every validation fold is strictly out-of-sample
	 * and the training window only expands (never looks ahead).
	 */
	splitWalkForward(
		steps: MarketStep[],
		folds: number
	): { train: MarketStep[]; validation: MarketStep[]; id: string }[] {
		if (folds < 2 || steps.length < MIN_TRAINING_STEPS * folds) {
			return [this.splitTrainValidation(steps, DEFAULT_VALIDATION_SPLIT)];
		}

		const chunkSize = Math.floor(steps.length / folds);
		const windows: {
			train: MarketStep[];
			validation: MarketStep[];
			id: string;
		}[] = [];

		for (let fold = 1; fold < folds; fold++) {
			const trainEnd = fold * chunkSize;
			const valEnd = Math.min((fold + 1) * chunkSize, steps.length);
			windows.push({
				id: `wf_window_${++WindowSplitter._nextId}`,
				train: steps.slice(0, trainEnd),
				validation: steps.slice(trainEnd, valEnd),
			});
		}

		return windows;
	}

	getAllWindows(
		ctx: MarketDataContext,
		validationSplit: number = DEFAULT_VALIDATION_SPLIT,
		walkForwardFolds: number = DEFAULT_WALK_FORWARD_FOLDS,
		testSplit: number = DEFAULT_TEST_SPLIT
	): WindowSet | WindowSet[] | null {
		const all = this.buildMarketSteps(ctx);
		// The newest steps are cut off first: train and validation never see them.
		const testStart = Math.floor(all.length * (1 - testSplit));
		const steps = all.slice(0, testStart);
		const test = all.slice(testStart);
		if (steps.length < MIN_TRAINING_STEPS || test.length < MIN_TRAINING_STEPS) {
			return null;
		}
		if (walkForwardFolds >= 2) {
			return this.splitWalkForward(steps, walkForwardFolds).map((ws) => ({
				...ws,
				test,
			}));
		}
		return { ...this.splitTrainValidation(steps, validationSplit), test };
	}
}
