import {
	Cash,
	type Percentage,
	type Price,
	type Volume,
} from "@trading-model/common/domain/primitives";

export function roundValue(value: number, decimals: number): number {
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
}

export interface TradeCostParams {
	amount: Volume;
	price: Price;
	feeRate: Percentage;
	decimals: number;
}

function _computeBaseCost(params: TradeCostParams): number {
	return roundValue(
		Number(params.amount) * Number(params.price),
		params.decimals
	);
}

function _computeFee(base: number, params: TradeCostParams): Cash {
	return Cash.of(roundValue(base * Number(params.feeRate), params.decimals));
}

export interface BuyCostResult {
	totalCost: Cash;
	fee: Cash;
}

export interface SellProceedsResult {
	netProceeds: Cash;
	fee: Cash;
}

export function computeBuyCosts(params: TradeCostParams): BuyCostResult {
	const baseCost = _computeBaseCost(params);
	const fee = _computeFee(baseCost, params);
	const totalCost = Cash.of(
		roundValue(baseCost + Number(fee), params.decimals)
	);
	return { totalCost, fee };
}

export function computeSellProceeds(
	params: TradeCostParams
): SellProceedsResult {
	const baseProceeds = _computeBaseCost(params);
	const fee = _computeFee(baseProceeds, params);
	const netProceeds = Cash.of(
		roundValue(baseProceeds - Number(fee), params.decimals)
	);
	return { netProceeds, fee };
}
