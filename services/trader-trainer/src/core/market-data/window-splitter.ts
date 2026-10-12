import {
	Percentage,
	PositiveInt,
	type Price,
} from "@trading-model/common/domain/primitives";
import { buildFeatures as buildFeaturesFn } from "../feature-builder";
import type { WindowSet } from "../genetic-algorithm/generation-types";
import type { MarketStep } from "../genetic-algorithm/genome-types";
import type { SymbolState, TradingSymbol } from "../market-data-types";
import type { MarketDataContext } from "./market-data-context";

/** Minimum number of market steps required before training can start. */
export const MIN_TRAINING_STEPS = PositiveInt.of(10);

/** Default fraction of data held out for validation during training. */
export const DEFAULT_VALIDATION_SPLIT = Percentage.of(0.2);

/** Default number of walk-forward folds (1 = single split, no rolling). */
export const DEFAULT_WALK_FORWARD_FOLDS = 1;

/** Handles building market steps and train/validation window splitting. */
export class WindowSplitter {
	constructor(private readonly _states: Map<TradingSymbol, SymbolState>) {}

	buildMarketSteps(ctx: MarketDataContext): MarketStep[] {
		const state = this._states.get(ctx.symbol);
		if (!state || state.candles.length < 2) {
			return [];
		}
		return this._buildStepsFromState(state, ctx.priceSnapshot);
	}

	private _buildStepsFromState(
		state: SymbolState,
		priceSnapshot: Record<TradingSymbol, Price>
	): MarketStep[] {
		const steps: MarketStep[] = [];
		for (let i = 1; i < state.candles.length; i++) {
			steps.push(this._buildSingleStep(state, i, priceSnapshot));
		}
		return steps;
	}

	private _buildSingleStep(
		state: SymbolState,
		idx: number,
		priceSnapshot: Record<TradingSymbol, Price>
	): MarketStep {
		return {
			price: state.candles[idx].close,
			features: buildFeaturesFn({
				state,
				idx,
				priceSnapshot,
			}),
			timestamp: state.candles[idx].timestamp,
		};
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
		walkForwardFolds: number = DEFAULT_WALK_FORWARD_FOLDS
	): WindowSet | WindowSet[] | null {
		const steps = this.buildMarketSteps(ctx);
		if (steps.length < MIN_TRAINING_STEPS) {
			return null;
		}
		if (walkForwardFolds >= 2) {
			return this.splitWalkForward(steps, walkForwardFolds);
		}
		return this.splitTrainValidation(steps, validationSplit);
	}
}
