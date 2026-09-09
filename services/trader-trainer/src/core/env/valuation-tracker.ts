import {
	Cash,
	type DecimalPrecision,
} from "@trading-model/common/domain/primitives";
import type { PortfolioState, ValuationConfig } from "./portfolio-state";
import { computePnL, computeValuation } from "./portfolio-valuation";

export class ValuationTracker {
	private readonly _history: Cash[] = [];

	constructor(config: ValuationConfig) {
		this._initialCash = config.initialCash;
		this._decimals = config.decimals;
		this._history.push(config.initialCash);
	}

	private readonly _initialCash: Cash;
	private readonly _decimals: DecimalPrecision;

	get history(): readonly Cash[] {
		return this._history;
	}

	record(state: PortfolioState): void {
		this._history.push(this.computeValuation(state));
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
		return this._history.length > 0
			? Cash.of(Math.max(...this._history))
			: this._initialCash;
	}

	reset(): void {
		this._history.length = 0;
		this._history.push(this._initialCash);
	}
}
