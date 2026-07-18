import {
	Cash,
	DecimalPrecision,
	type Percentage,
	type Price,
	type Volume,
} from "@trading-model/common/domain/primitives";

export function roundValue(value: number, decimals: DecimalPrecision): number {
	return DecimalPrecision.round(value, decimals);
}

export class TradeCostParams {
	constructor(
		readonly amount: Volume,
		readonly price: Price,
		readonly feeRate: Percentage,
		readonly decimals: DecimalPrecision
	) {}

	private _computeBaseCost(): number {
		return roundValue(Number(this.amount) * Number(this.price), this.decimals);
	}

	private _computeFee(base: number): Cash {
		return Cash.of(roundValue(base * Number(this.feeRate), this.decimals));
	}

	computeBuyCosts(): BuyCostResult {
		const baseCost = this._computeBaseCost();
		const fee = this._computeFee(baseCost);
		const totalCost = Cash.of(
			roundValue(baseCost + Number(fee), this.decimals)
		);
		return { totalCost, fee };
	}

	computeSellProceeds(): SellProceedsResult {
		const baseProceeds = this._computeBaseCost();
		const fee = this._computeFee(baseProceeds);
		const netProceeds = Cash.of(
			roundValue(baseProceeds - Number(fee), this.decimals)
		);
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
