export interface WalletMetrics {
	pnl: number;
	returnRate: number;
	peakValuation: number;
	drawdown: number;
	totalFeesPaid: number;
	tradeCount: number;
}

function round(value: number, decimals: number): number {
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
}

export interface ComputeWalletMetricsParams {
	cash: number;
	position: number;
	price: number;
	peakValuation: number;
	initialCash: number;
	totalFeesPaid: number;
	tradeCount: number;
	decimals: number;
}

export function computeWalletMetrics(
	params: ComputeWalletMetricsParams
): WalletMetrics {
	const valuation = round(
		params.cash + params.position * params.price,
		params.decimals
	);
	return {
		pnl: round(valuation - params.initialCash, params.decimals),
		returnRate: round(
			(valuation - params.initialCash) / params.initialCash,
			params.decimals
		),
		peakValuation: params.peakValuation,
		drawdown:
			params.peakValuation > 0
				? round(
						(params.peakValuation - valuation) / params.peakValuation,
						params.decimals
					)
				: 0,
		totalFeesPaid: params.totalFeesPaid,
		tradeCount: params.tradeCount,
	};
}
