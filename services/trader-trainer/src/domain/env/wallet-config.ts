import {
	Cash,
	DecimalPrecision,
	Percentage,
	Price,
	type Volume,
} from "@trading-model/primitives/primitives";
import type { BuyCostResult, SellProceedsResult } from "./wallet-costs";
import { roundValue, TradeCostParams } from "./wallet-costs";
import { validateConfig } from "./wallet-validation";

/**
 * Default exposure cap (ADR-0025): the position is worth at most the initial
 * cash, i.e. no leverage. Written in the model manifest.
 */
export const DEFAULT_MAX_EXPOSURE_FRACTION = 1;

export interface WalletConfigParams {
	initialCash: Cash;
	initialPrice: Price;
	feeRate?: Percentage;
	/** Max position value (at the current price) as a fraction of `initialCash`. */
	maxExposureFraction?: number;
	decimals?: DecimalPrecision;
}

export class WalletConfig {
	readonly initialCash: Cash;
	readonly initialPrice: Price;
	readonly feeRate: Percentage;
	readonly maxExposureFraction: number;
	readonly decimals: DecimalPrecision;

	constructor(params: WalletConfigParams) {
		const resolved: Required<WalletConfigParams> = {
			initialCash: Cash.of(params.initialCash),
			initialPrice: Price.of(params.initialPrice),
			feeRate: Percentage.of(params.feeRate ?? Percentage.zero()),
			maxExposureFraction:
				params.maxExposureFraction ?? DEFAULT_MAX_EXPOSURE_FRACTION,
			decimals: params.decimals ?? DecimalPrecision.of(8),
		};
		validateConfig(resolved);
		this.initialCash = resolved.initialCash;
		this.initialPrice = resolved.initialPrice;
		this.feeRate = resolved.feeRate;
		this.maxExposureFraction = resolved.maxExposureFraction;
		this.decimals = resolved.decimals;
	}

	roundValue(value: number): number {
		return roundValue(value, this.decimals);
	}

	private _buildTradeParams(amount: Volume, price: Price): TradeCostParams {
		return new TradeCostParams(amount, price, this.feeRate, this.decimals);
	}

	computeBuyCosts(amount: Volume, price: Price): BuyCostResult {
		return this._buildTradeParams(amount, price).computeBuyCosts();
	}

	computeSellProceeds(amount: Volume, price: Price): SellProceedsResult {
		return this._buildTradeParams(amount, price).computeSellProceeds();
	}
}
