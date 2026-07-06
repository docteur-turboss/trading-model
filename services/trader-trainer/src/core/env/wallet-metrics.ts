import { Cash, Percentage, Price, Volume } from "@trading-model/common/domain/primitives";

export interface WalletMetrics {
	pnl: Cash;
	returnRate: Percentage;
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

function _computeValuation(params: ComputeWalletMetricsParams): Cash {
	return Cash.of(round(+params.cash + params.position * +params.price, params.decimals));
}

function _computePnL(valuation: Cash, params: ComputeWalletMetricsParams): Cash {
	return Cash.of(round(+valuation - +params.initialCash, params.decimals));
}

function _computeReturnRate(valuation: Cash, params: ComputeWalletMetricsParams): Percentage {
	return Percentage.of(
		round(
			(+valuation - +params.initialCash) / +params.initialCash,
			params.decimals
		)
	);
}

function _computeDrawdown(valuation: Cash, params: ComputeWalletMetricsParams): number {
	return +params.peakValuation > 0
		? round(
				(+params.peakValuation - +valuation) / +params.peakValuation,
				params.decimals
			)
		: 0;
}

export function computeWalletMetrics(
	params: ComputeWalletMetricsParams
): WalletMetrics {
	const valuation: Cash = _computeValuation(params);
	return {
		pnl: _computePnL(valuation, params),
		returnRate: _computeReturnRate(valuation, params),
		peakValuation: params.peakValuation,
		drawdown: Percentage.of(_computeDrawdown(valuation, params)),
		totalFeesPaid: params.totalFeesPaid,
		tradeCount: params.tradeCount,
	};
}
