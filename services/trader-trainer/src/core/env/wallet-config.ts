import { Cash, Percentage, Price, Volume } from "@trading-model/common/domain/primitives";
import { validateConfig } from "./wallet-validation";
import { computeBuyCosts, computeSellProceeds, roundValue } from "./wallet-costs";

export interface WalletConfigParams {
	initialCash: Cash;
	initialPrice: Price;
	feeRate?: Percentage;
	maxPosition?: Volume;
	decimals?: number;
}

export class WalletConfig {
	readonly initialCash: Cash;
	readonly initialPrice: Price;
	readonly feeRate: Percentage;
	readonly maxPosition: Volume;
	readonly decimals: number;

	constructor(params: WalletConfigParams) {
		const resolved: Required<WalletConfigParams> = {
			initialCash: Cash.of(+params.initialCash),
			initialPrice: Price.of(+params.initialPrice),
			feeRate: Percentage.of(params.feeRate ?? Percentage.zero()),
			maxPosition: Volume.of(params.maxPosition ?? Volume.of(Number.MAX_VALUE)),
			decimals: params.decimals ?? 8,
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

	computeBuyCosts(amount: Volume, price: Price): { totalCost: Cash; fee: Cash } {
		return computeBuyCosts({
			amount,
			price,
			feeRate: this.feeRate,
			decimals: this.decimals,
		});
	}

	computeSellProceeds(
		amount: Volume,
		price: Price
	): { netProceeds: Cash; fee: Cash } {
		return computeSellProceeds({
			amount,
			price,
			feeRate: this.feeRate,
			decimals: this.decimals,
		});
	}
}
