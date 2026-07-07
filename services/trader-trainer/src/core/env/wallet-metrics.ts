import {
	Cash,
	Percentage,
	type Price,
	type Volume,
} from "@trading-model/common/domain/primitives";

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
	return Cash.of(
		round(
			Number(params.cash) + params.position * Number(params.price),
			params.decimals
		)
	);
}

function _computePnL(
	valuation: Cash,
	params: ComputeWalletMetricsParams
): Cash {
	return Cash.of(
		round(Number(valuation) - Number(params.initialCash), params.decimals)
	);
}

function _computeReturnRate(
	valuation: Cash,
	params: ComputeWalletMetricsParams
): Percentage {
	return Percentage.of(
		round(
			(Number(valuation) - Number(params.initialCash)) /
				Number(params.initialCash),
			params.decimals
		)
	);
}

function _computeDrawdown(
	valuation: Cash,
	params: ComputeWalletMetricsParams
): Percentage {
	return Percentage.of(
		Number(params.peakValuation) > 0
			? round(
					(Number(params.peakValuation) - Number(valuation)) /
						Number(params.peakValuation),
					params.decimals
				)
			: 0
	);
}

export function computeWalletMetrics(
	params: ComputeWalletMetricsParams
): WalletMetrics {
	const valuation: Cash = _computeValuation(params);
	return {
		pnl: _computePnL(valuation, params),
		returnRate: _computeReturnRate(valuation, params),
		peakValuation: params.peakValuation,
		drawdown: _computeDrawdown(valuation, params),
		totalFeesPaid: params.totalFeesPaid,
		tradeCount: params.tradeCount,
	};
}
