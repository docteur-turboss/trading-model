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
		private readonly _states: Map<TradingSymbol, SymbolState>
	) {}

	buildMarketSteps(
		symbol: TradingSymbol,
		priceSnapshot: Record<TradingSymbol, Price>
	): MarketStep[] {
		const state = this._states.get(symbol);
		if (!state || state.candles.length < 2) {
			return [];
		}
		return this._buildStepsFromState(state, priceSnapshot);
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
		i: number,
		priceSnapshot: Record<TradingSymbol, Price>
	): MarketStep {
		return {
			price: state.candles[i].close,
			features: buildFeaturesFn({
				state,
				idx: i,
				priceSnapshot,
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
		validationSplit: number = DEFAULT_VALIDATION_SPLIT,
		priceSnapshot: Record<TradingSymbol, Price>
	): { id: string; train: MarketStep[]; validation: MarketStep[] } | null {
		const steps = this.buildMarketSteps(symbol, priceSnapshot);
		if (steps.length < MIN_TRAINING_STEPS) {
			return null;
		}
		return this.splitTrainValidation(steps, validationSplit);
	}
}
