import { Cash, Percentage, Price, Volume } from "@trading-model/common/domain/primitives";

export interface WalletMetrics {
	pnl: number;
	returnRate: number;
	peakValuation: Cash;
	drawdown: Percentage;
	totalFeesPaid: Cash;
	tradeCount: number;
}

function round(value: number, decimals: number): number {
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
}

export interface ComputeWalletMetricsParams {
	cash: Cash;
	position: Volume;
	price: Price;
	peakValuation: Cash;
	initialCash: Cash;
	totalFeesPaid: Cash;
	tradeCount: number;
	decimals: number;
}

function _computeValuation(params: ComputeWalletMetricsParams): number {
	return round(+params.cash + params.position * +params.price, params.decimals);
}

function _computePnL(valuation: number, params: ComputeWalletMetricsParams): number {
	return round(valuation - +params.initialCash, params.decimals);
}

function _computeReturnRate(valuation: number, params: ComputeWalletMetricsParams): number {
	return round(
		(valuation - +params.initialCash) / +params.initialCash,
		params.decimals
	);
}

function _computeDrawdown(valuation: number, params: ComputeWalletMetricsParams): number {
	return +params.peakValuation > 0
		? round(
				(+params.peakValuation - valuation) / +params.peakValuation,
				params.decimals
			)
		: 0;
}

export function computeWalletMetrics(
	params: ComputeWalletMetricsParams
): WalletMetrics {
	const valuation = _computeValuation(params);
	return {
		pnl: _computePnL(valuation, params),
		returnRate: _computeReturnRate(valuation, params),
		peakValuation: params.peakValuation,
		drawdown: Percentage.of(_computeDrawdown(valuation, params)),
		totalFeesPaid: params.totalFeesPaid,
		tradeCount: params.tradeCount,
	};
}
