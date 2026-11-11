import {
	Cash,
	DecimalPrecision,
	type Percentage,
	type Price,
	type Volume,
} from "@trading-model/primitives/primitives";

export function roundValue(value: number, decimals: DecimalPrecision): number {
	return DecimalPrecision.round(value, decimals);
}

export class TradeCostParams {
	constructor(
		readonly amount: Volume,
		readonly price: Price,
		readonly feeRate: Percentage,
		readonly decimals: DecimalPrecision,
		/** Half-spread + slippage, a fraction of the price paid on every fill (ADR-0064). */
		readonly executionCostRate: Percentage
	) {}

	/** `side` 1 = buy (pays above the price), -1 = sell (receives below it). */
	private _computeBaseCost(side: 1 | -1): number {
		return roundValue(
			this.amount * this.price * (1 + side * this.executionCostRate),
			this.decimals
		);
	}

	private _computeFee(base: number): Cash {
		return Cash.of(roundValue(base * this.feeRate, this.decimals));
	}

	computeBuyCosts(): BuyCostResult {
		const baseCost = this._computeBaseCost(1);
		const fee = this._computeFee(baseCost);
		const totalCost = Cash.of(roundValue(baseCost + fee, this.decimals));
		return { totalCost, fee };
	}

	computeSellProceeds(): SellProceedsResult {
		const baseProceeds = this._computeBaseCost(-1);
		const fee = this._computeFee(baseProceeds);
		const netProceeds = Cash.of(roundValue(baseProceeds - fee, this.decimals));
		return { netProceeds, fee };
	}
}

export interface BuyCostResult {
	totalCost: Cash;
	fee: Cash;
}

export interface SellProceedsResult {
	netProceeds: Cash;
	fee: Cash;
}
