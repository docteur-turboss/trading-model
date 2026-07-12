import type { Price } from "@trading-model/common/domain/primitives";
import { buildFeatures as buildFeaturesFn } from "../feature-builder";
import type { WindowSet } from "../genetic-algorithm/generation-types";
import type { MarketStep } from "../genetic-algorithm/genome-types";
import type { SymbolState, TradingSymbol } from "../market-data-types";
import type { MarketDataContext } from "./market-data-context";

/** Minimum number of market steps required before training can start. */
export const MIN_TRAINING_STEPS = 10;

/** Default fraction of data held out for validation during training. */
export const DEFAULT_VALIDATION_SPLIT = 0.2;

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

	getAllWindows(
		ctx: MarketDataContext,
		validationSplit: number = DEFAULT_VALIDATION_SPLIT
	): WindowSet | null {
		const steps = this.buildMarketSteps(ctx);
		if (steps.length < MIN_TRAINING_STEPS) {
			return null;
		}
		return this.splitTrainValidation(steps, validationSplit);
	}
}
