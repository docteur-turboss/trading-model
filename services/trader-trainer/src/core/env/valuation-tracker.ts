import { Cash } from "@trading-model/common/domain/primitives";
import type { PortfolioState } from "./portfolio-state";

function roundValue(value: number, decimals: number): number {
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
}

export class ValuationTracker {
	private readonly _history: Cash[] = [];

	constructor(
		private readonly _initialCash: Cash,
		private readonly _decimals: number
	) {
		this._history.push(_initialCash);
	}

	get history(): readonly Cash[] {
		return this._history;
	}

	record(state: PortfolioState): void {
		this._history.push(this.computeValuation(state));
	}

	computeValuation(state: PortfolioState): Cash {
		return Cash.of(
			roundValue(
				Number(state.cash) + state.position * state.price,
				this._decimals
			)
		);
	}

	computePnL(state: PortfolioState): Cash {
		const valuation = this.computeValuation(state);
		return Cash.of(
			roundValue(Number(valuation) - Number(this._initialCash), this._decimals)
		);
	}

	getPeakValuation(): Cash {
		return this._history.length > 0
			? Cash.of(Math.max(...this._history.map((v) => Number(v))))
			: this._initialCash;
	}

	reset(): void {
		this._history.length = 0;
		this._history.push(this._initialCash);
	}
}
