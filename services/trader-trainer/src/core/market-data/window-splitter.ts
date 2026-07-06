import type { Price } from "@trading-model/common/domain/primitives";
import { buildFeatures as buildFeaturesFn } from "../feature-builder";
import type { MarketStep } from "../genetic-algorithm/genome-types";
import type { SymbolState, TradingSymbol } from "../market-data-types";

/** Minimum number of market steps required before training can start. */
export const MIN_TRAINING_STEPS = 10;

/** Default fraction of data held out for validation during training. */
export const DEFAULT_VALIDATION_SPLIT = 0.2;

/** Handles building market steps and train/validation window splitting. */
export class WindowSplitter {
	constructor(
		private readonly _states: Map<TradingSymbol, SymbolState>,
		private readonly _priceSnapshot: Record<TradingSymbol, Price>
	) {}

	buildMarketSteps(symbol: TradingSymbol): MarketStep[] {
		const state = this._states.get(symbol);
		if (!state || state.candles.length < 2) {
			return [];
		}
		return this._buildStepsFromState(state);
	}

	private _buildStepsFromState(state: SymbolState): MarketStep[] {
		const steps: MarketStep[] = [];
		for (let i = 1; i < state.candles.length; i++) {
			steps.push(this._buildSingleStep(state, i));
		}
		return steps;
	}

	private _buildSingleStep(state: SymbolState, i: number): MarketStep {
		return {
			price: state.candles[i].close,
			features: buildFeaturesFn({
				state,
				idx: i,
				priceSnapshot: this._priceSnapshot,
			}),
			timestamp: state.candles[i].timestamp,
		};
	}

	splitTrainValidation(
		steps: MarketStep[],
		validationSplit: number
	): { train: MarketStep[]; validation: MarketStep[]; id: string } {
		const splitIdx = Math.floor(steps.length * (1 - validationSplit));
		return {
			id: `window_${Date.now()}`,
			train: steps.slice(0, splitIdx),
			validation: steps.slice(splitIdx),
		};
	}

	getAllWindows(
		symbol: TradingSymbol,
		validationSplit: number = DEFAULT_VALIDATION_SPLIT
	): { id: string; train: MarketStep[]; validation: MarketStep[] } | null {
		const steps = this.buildMarketSteps(symbol);
		if (steps.length < MIN_TRAINING_STEPS) {
			return null;
		}
		return this.splitTrainValidation(steps, validationSplit);
	}
}
