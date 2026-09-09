import {
	type Cash,
	DecimalPrecision,
	Percentage,
	type PositiveInt,
	type Price,
	type Volume,
} from "@trading-model/common/domain/primitives";
import { computePnL, computeValuation } from "./portfolio-valuation";

export interface WalletMetrics {
	pnl: Cash;
	returnRate: Percentage;
	peakValuation: Cash;
	drawdown: Percentage;
	totalFeesPaid: Cash;
	tradeCount: PositiveInt;
}

export interface ComputeWalletMetricsParams {
	cash: Cash;
	position: Volume;
	price: Price;
	peakValuation: Cash;
	initialCash: Cash;
	totalFeesPaid: Cash;
	tradeCount: PositiveInt;
	decimals: DecimalPrecision;
}

export class WalletMetricsComputer {
	constructor(private readonly _params: ComputeWalletMetricsParams) {}

	private _computeValuation(): Cash {
		return computeValuation(
			this._params.cash,
			this._params.position,
			this._params.price,
			this._params.decimals
		);
	}

	private _computePnL(valuation: Cash): Cash {
		return computePnL(
			valuation,
			this._params.initialCash,
			this._params.decimals
		);
	}

	private _computeReturnRate(valuation: Cash): Percentage {
		const ratio =
			(valuation - this._params.initialCash) / this._params.initialCash;
		const rounded = DecimalPrecision.round(ratio, this._params.decimals);
		return Number.isFinite(rounded)
			? Percentage.of(rounded)
			: (rounded as Percentage);
	}

	private _computeDrawdown(valuation: Cash): Percentage {
		return Percentage.of(
			this._params.peakValuation > 0
				? DecimalPrecision.round(
						(this._params.peakValuation - valuation) /
							this._params.peakValuation,
						this._params.decimals
					)
				: 0
		);
	}

	compute(): WalletMetrics {
		const valuation = this._computeValuation();
		return {
			pnl: this._computePnL(valuation),
			returnRate: this._computeReturnRate(valuation),
			peakValuation: this._params.peakValuation,
			drawdown: this._computeDrawdown(valuation),
			totalFeesPaid: this._params.totalFeesPaid,
			tradeCount: this._params.tradeCount,
		};
	}
}
