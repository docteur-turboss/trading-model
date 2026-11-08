import {
	type Cash,
	type Price,
	Volume,
} from "@trading-model/primitives/primitives";
import { computePnL, computeValuation } from "./portfolio-valuation";
import { TradeExecutor } from "./trade-executor";
import { WalletConfig, type WalletConfigParams } from "./wallet-config";

export type { WalletConfigParams as WalletConfig };

export interface WalletAPI {
	buy: (amount: Volume) => boolean;
	sell: (amount: Volume) => boolean;
	setPrice: (newPrice: Price) => void;
	getPosition: () => Volume;
	getCash: () => Cash;
	getValuation: () => Cash;
	getPrice: () => Price;
	getPnL: () => Cash;
	reset: () => void;
}

class Wallet implements WalletAPI {
	private readonly _executor: TradeExecutor;
	private readonly _config: WalletConfig;

	constructor(params: WalletConfigParams) {
		const config = new WalletConfig(params);
		this._config = config;
		this._executor = new TradeExecutor(config, {
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
		return computeValuation(
			this._executor.cash,
			this._executor.position,
			this._executor.price,
			this._config.decimals
		);
	}

	getPrice(): Price {
		return this._executor.price;
	}

	getPnL(): Cash {
		return computePnL(
			this.getValuation(),
			this._config.initialCash,
			this._config.decimals
		);
	}

	reset(): void {
		this._executor.reset();
	}
}

export const createWallet = (params: WalletConfigParams): WalletAPI =>
	new Wallet(params);
