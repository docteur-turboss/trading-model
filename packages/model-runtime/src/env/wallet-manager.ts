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
	/** Buys at `fillPrice`, the marked price when omitted. */
	buy: (amount: Volume, fillPrice?: Price) => boolean;
	/** Sells at `fillPrice`, the marked price when omitted. */
	sell: (amount: Volume, fillPrice?: Price) => boolean;
	setPrice: (newPrice: Price) => void;
	getPosition: () => Volume;
	getCash: () => Cash;
	getValuation: () => Cash;
	getPrice: () => Price;
	getPnL: () => Cash;
	/** Fees and execution cost paid since the last reset. */
	getCostsPaid: () => { feesPaid: number; executionCostPaid: number };
	reset: () => void;
}

export const createWallet = (params: WalletConfigParams): WalletAPI => {
	const config = new WalletConfig(params);
	const executor = new TradeExecutor(config, {
		price: config.initialPrice,
		cash: config.initialCash,
		position: Volume.zero(),
	});
	const getValuation = (): Cash =>
		computeValuation(
			executor.cash,
			executor.position,
			executor.price,
			config.decimals
		);
	return {
		buy: (amount, fillPrice) => executor.buy(amount, fillPrice),
		sell: (amount, fillPrice) => executor.sell(amount, fillPrice),
		setPrice: (newPrice) => executor.setPrice(newPrice),
		getPosition: () => executor.position,
		getCash: () => executor.cash,
		getValuation,
		getPrice: () => executor.price,
		getPnL: () =>
			computePnL(getValuation(), config.initialCash, config.decimals),
		getCostsPaid: () => executor.costsPaid,
		reset: () => executor.reset(),
	};
};
