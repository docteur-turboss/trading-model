import { Cash, Percentage, Price, Volume } from "@trading-model/common/domain/primitives";

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

export function computeBuyCosts(params: TradeCostParams): { totalCost: Cash; fee: Cash } {
	const baseCost = roundValue(+params.amount * +params.price, params.decimals);
	const fee = Cash.of(roundValue(baseCost * +params.feeRate, params.decimals));
	const totalCost = Cash.of(roundValue(baseCost + +fee, params.decimals));
	return { totalCost, fee };
}

export function computeSellProceeds(params: TradeCostParams): { netProceeds: Cash; fee: Cash } {
	const baseProceeds = roundValue(+params.amount * +params.price, params.decimals);
	const fee = Cash.of(roundValue(baseProceeds * +params.feeRate, params.decimals));
	const netProceeds = Cash.of(roundValue(baseProceeds - +fee, params.decimals));
	return { netProceeds, fee };
}
