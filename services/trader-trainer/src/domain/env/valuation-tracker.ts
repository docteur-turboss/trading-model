import {
	Cash,
	type DecimalPrecision,
} from "@trading-model/primitives/primitives";
import type { PortfolioState, ValuationConfig } from "./portfolio-state";
import { computePnL, computeValuation } from "./portfolio-valuation";

export class ValuationTracker {
	// Running peak: keeping every valuation made each step O(T).
	private _peak: number;

	constructor(config: ValuationConfig) {
		this._initialCash = config.initialCash;
		this._decimals = config.decimals;
		this._peak = config.initialCash;
	}

	private readonly _initialCash: Cash;
	private readonly _decimals: DecimalPrecision;

	record(state: PortfolioState): void {
		this._peak = Math.max(this._peak, this.computeValuation(state));
	}

	computeValuation(state: PortfolioState): Cash {
		return computeValuation(
			state.cash,
			state.position,
			state.price,
			this._decimals
		);
	}

	computePnL(state: PortfolioState): Cash {
		return computePnL(
			this.computeValuation(state),
			this._initialCash,
			this._decimals
		);
	}

	getPeakValuation(): Cash {
		return Cash.of(this._peak);
	}

	reset(): void {
		this._peak = this._initialCash;
	}
}
