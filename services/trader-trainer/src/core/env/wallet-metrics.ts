import {
	Cash,
	DecimalPrecision,
	Percentage,
	type PositiveInt,
} from "@trading-model/common/domain/primitives";
import type { PortfolioState } from "./portfolio-state";

export interface WalletMetrics {
	pnl: Cash;
	returnRate: Percentage;
	peakValuation: Cash;
	drawdown: Percentage;
	totalFeesPaid: Cash;
	tradeCount: PositiveInt;
}

export interface ComputeWalletMetricsParams extends PortfolioState {
	peakValuation: Cash;
	initialCash: Cash;
	totalFeesPaid: Cash;
	tradeCount: PositiveInt;
	decimals: DecimalPrecision;
}

function _computeValuation(params: ComputeWalletMetricsParams): Cash {
	return Cash.of(
		DecimalPrecision.round(
			Number(params.cash) + params.position * Number(params.price),
			params.decimals
		)
	);
}

function _computePnL(
	valuation: Cash,
	params: ComputeWalletMetricsParams
): Cash {
	return DecimalPrecision.round(
		Number(valuation) - Number(params.initialCash),
		params.decimals
	) as Cash;
}

function _computeReturnRate(
	valuation: Cash,
	params: ComputeWalletMetricsParams
): Percentage {
	return DecimalPrecision.round(
		(Number(valuation) - Number(params.initialCash)) /
			Number(params.initialCash),
		params.decimals
	) as unknown as Percentage;
}

function _computeDrawdown(
	valuation: Cash,
	params: ComputeWalletMetricsParams
): Percentage {
	return Percentage.of(
		Number(params.peakValuation) > 0
			? DecimalPrecision.round(
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
