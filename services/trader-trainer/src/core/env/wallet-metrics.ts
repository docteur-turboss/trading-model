import {
	Cash,
	DecimalPrecision,
	Percentage,
	type PositiveInt,
	type Price,
	type Volume,
} from "@trading-model/common/domain/primitives";

export interface WalletMetrics {
	pnl: Cash;
	returnRate: Percentage;
	peakValuation: Cash;
	drawdown: Percentage;
	totalFeesPaid: Cash;
	tradeCount: PositiveInt;
}

export class ComputeWalletMetricsParams {
	constructor(
		readonly cash: Cash,
		readonly position: Volume,
		readonly price: Price,
		readonly peakValuation: Cash,
		readonly initialCash: Cash,
		readonly totalFeesPaid: Cash,
		readonly tradeCount: PositiveInt,
		readonly decimals: DecimalPrecision
	) {}

	private _computeValuation(): Cash {
		return Cash.of(
			DecimalPrecision.round(
				Number(this.cash) + this.position * Number(this.price),
				this.decimals
			)
		);
	}

	private _computePnL(valuation: Cash): Cash {
		return DecimalPrecision.round(
			Number(valuation) - Number(this.initialCash),
			this.decimals
		) as Cash;
	}

	private _computeReturnRate(valuation: Cash): Percentage {
		return DecimalPrecision.round(
			(Number(valuation) - Number(this.initialCash)) / Number(this.initialCash),
			this.decimals
		) as unknown as Percentage;
	}

	private _computeDrawdown(valuation: Cash): Percentage {
		return Percentage.of(
			Number(this.peakValuation) > 0
				? DecimalPrecision.round(
						(Number(this.peakValuation) - Number(valuation)) /
							Number(this.peakValuation),
						this.decimals
					)
				: 0
		);
	}

	compute(): WalletMetrics {
		const valuation = this._computeValuation();
		return {
			pnl: this._computePnL(valuation),
			returnRate: this._computeReturnRate(valuation),
			peakValuation: this.peakValuation,
			drawdown: this._computeDrawdown(valuation),
			totalFeesPaid: this.totalFeesPaid,
			tradeCount: this.tradeCount,
		};
	}
}
