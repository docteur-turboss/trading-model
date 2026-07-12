import {
	type Cash,
	type Price,
	Volume,
} from "@trading-model/common/domain/primitives";
import { TradeExecutor } from "./trade-executor";
import { type TradeRecord, TradeRecorder } from "./trade-recorder";
import { WalletConfig, type WalletConfigParams } from "./wallet-config";
import { computeWalletMetrics, type WalletMetrics } from "./wallet-metrics";

export type { TradeRecord, WalletConfigParams as WalletConfig, WalletMetrics };

export interface WalletAPI {
	buy: (amount: Volume) => boolean;
	sell: (amount: Volume) => boolean;
	setPrice: (newPrice: Price) => void;
	getPosition: () => Volume;
	getCash: () => Cash;
	getValuation: () => Cash;
	getPrice: () => Price;
	getPnL: () => Cash;
	getMetrics: () => WalletMetrics;
	getHistory: () => Readonly<TradeRecord[]>;
	reset: () => void;
}

export class Wallet implements WalletAPI {
	private readonly _executor: TradeExecutor;
	private readonly _recorder: TradeRecorder;

	constructor(params: WalletConfigParams) {
		const config = new WalletConfig(params);
		this._recorder = new TradeRecorder({
			initialCash: config.initialCash,
			decimals: config.decimals,
		});
		this._executor = new TradeExecutor(config, this._recorder, {
			price: config.initialPrice,
			cash: config.initialCash,
			position: Volume.zero(),
		});
	}

	buy(amount: Volume): boolean {
		return this._executor.buy(amount);
	}

	sell(amount: Volume): boolean {
		return this._executor.sell(amount);
	}

	setPrice(newPrice: Price): void {
		this._executor.setPrice(newPrice);
	}

	getPosition(): Volume {
		return this._executor.position;
	}

	getCash(): Cash {
		return this._executor.cash;
	}

	getValuation(): Cash {
		return this._recorder.computeValuation(this._executor);
	}

	getPrice(): Price {
		return this._executor.price;
	}

	getPnL(): Cash {
		return this._recorder.computePnL(this._executor);
	}

	getMetrics(): WalletMetrics {
		return computeWalletMetrics({
			cash: this._executor.cash,
			position: this._executor.position,
			price: this._executor.price,
			peakValuation: this._recorder.getPeakValuation(),
			initialCash: this._executor.config.initialCash,
			totalFeesPaid: this._recorder.getTotalFeesPaid(),
			tradeCount: this._recorder.getTradeCount(),
			decimals: this._executor.config.decimals,
		});
	}

	getHistory(): Readonly<TradeRecord[]> {
		return this._recorder.getHistory();
	}

	reset(): void {
		this._executor.reset();
	}
}

export const createWallet = (params: WalletConfigParams): WalletAPI =>
	new Wallet(params);
