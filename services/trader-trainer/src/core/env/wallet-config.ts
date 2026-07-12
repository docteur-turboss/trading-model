import {
	Cash,
	DecimalPrecision,
	Percentage,
	Price,
	Volume,
} from "@trading-model/common/domain/primitives";
import {
	computeBuyCosts,
	computeSellProceeds,
	roundValue,
	type TradeCostParams,
} from "./wallet-costs";
import { validateConfig } from "./wallet-validation";

export interface WalletConfigParams {
	initialCash: Cash;
	initialPrice: Price;
	feeRate?: Percentage;
	maxPosition?: Volume;
	decimals?: DecimalPrecision;
}

export class WalletConfig {
	readonly initialCash: Cash;
	readonly initialPrice: Price;
	readonly feeRate: Percentage;
	readonly maxPosition: Volume;
	readonly decimals: DecimalPrecision;

	constructor(params: WalletConfigParams) {
		const resolved: Required<WalletConfigParams> = {
			initialCash: Cash.of(Number(params.initialCash)),
			initialPrice: Price.of(Number(params.initialPrice)),
			feeRate: Percentage.of(params.feeRate ?? Percentage.zero()),
			maxPosition: Volume.of(params.maxPosition ?? Volume.of(Number.MAX_VALUE)),
			decimals: params.decimals ?? DecimalPrecision.of(8),
		};
		validateConfig(resolved);
		this.initialCash = resolved.initialCash;
		this.initialPrice = resolved.initialPrice;
		this.feeRate = resolved.feeRate;
		this.maxPosition = resolved.maxPosition;
		this.decimals = resolved.decimals;
	}

	roundValue(value: number): number {
		return roundValue(value, this.decimals);
	}

	private _buildTradeParams(amount: Volume, price: Price): TradeCostParams {
		return {
			amount,
			price,
			feeRate: this.feeRate,
			decimals: this.decimals,
		};
	}

	computeBuyCosts(
		amount: Volume,
		price: Price
	): import("./wallet-costs").BuyCostResult {
		return computeBuyCosts(this._buildTradeParams(amount, price));
	}

	computeSellProceeds(
		amount: Volume,
		price: Price
	): import("./wallet-costs").SellProceedsResult {
		return computeSellProceeds(this._buildTradeParams(amount, price));
	}
}
