import { Cash, Price, Volume } from "@trading-model/common/domain/primitives";
import { type PortfolioState } from "./portfolio-state";
import { TradeHistory, type TradeRecord } from "./trade-history";
import { ValuationTracker } from "./valuation-tracker";
import { computeWalletMetrics, type WalletMetrics } from "./wallet-metrics";
import { WalletConfig, type WalletConfigParams } from "./wallet-config";

export type { TradeRecord, WalletMetrics };
export type { WalletConfigParams as WalletConfig };

export interface WalletAPI {
	buy: (amount: Volume) => boolean;
	sell: (amount: Volume) => boolean;
	setPrice: (newPrice: Price) => void;
	getPosition: () => Volume;
	getCash: () => Cash;
	getValuation: () => Cash;
	getPrice: () => Price;
	getPnL: () => number;
	getMetrics: () => WalletMetrics;
	getHistory: () => Readonly<TradeRecord[]>;
	reset: () => void;
}

export class Wallet implements WalletAPI {
	private readonly _config: WalletConfig;
	private _price: Price;
	private _cash: Cash;
	private _position: Volume = Volume.zero();
	private readonly _valuationTracker: ValuationTracker;
	private readonly _tradeHistory = new TradeHistory();

	constructor(params: WalletConfigParams) {
		this._config = new WalletConfig(params);
		this._price = this._config.initialPrice;
		this._cash = this._config.initialCash;
		this._valuationTracker = new ValuationTracker(
			this._config.initialCash,
			this._config.decimals
		);
	}

	private _getState(): PortfolioState {
		return { cash: this._cash, position: this._position, price: this._price };
	}

	private _recordValuation(): void {
		this._valuationTracker.record(this._getState());
	}

	buy(amount: Volume): boolean {
		const amt = +amount;
		if (!Number.isFinite(amt) || amt <= 0) {
			return false;
		}
		const newPosition = Volume.of(
			this._config.roundValue(+this._position + amt)
		);
		if (+newPosition > +this._config.maxPosition) {
			return false;
		}
		const { totalCost, fee } = this._config.computeBuyCosts(amount, this._price);
		if (+totalCost > +this._cash) {
			return false;
		}
		this._position = newPosition;
		this._cash = Cash.of(
			this._config.roundValue(+this._cash - +totalCost)
		);
		this._recordTrade("buy", amount, fee);
		return true;
	}

	sell(amount: Volume): boolean {
		const amt = +amount;
		if (!Number.isFinite(amt) || amt <= 0 || amt > +this._position) {
			return false;
		}
		const { netProceeds, fee } = this._config.computeSellProceeds(
			amount,
			this._price
		);
		this._position = Volume.of(
			this._config.roundValue(+this._position - amt)
		);
		this._cash = Cash.of(
			this._config.roundValue(+this._cash + netProceeds)
		);
		this._recordTrade("sell", amount, fee);
		return true;
	}

	private _recordTrade(
		action: "buy" | "sell",
		amount: Volume,
		fee: Cash
	): void {
		this._tradeHistory.record({
			action,
			amount,
			fee: Cash.of(this._config.roundValue(+fee)),
			price: this._price,
			cashAfter: this._cash,
			positionAfter: this._position,
		});
		this._recordValuation();
	}

	setPrice(newPrice: Price): void {
		if (!Number.isFinite(+newPrice) || +newPrice <= 0) {
			throw new Error(`setPrice received invalid value: ${newPrice}`);
		}
		this._price = newPrice;
		this._tradeHistory.incrementStep();
		this._recordValuation();
	}

	getPosition(): Volume {
		return this._position;
	}

	getCash(): Cash {
		return this._cash;
	}

	getValuation(): Cash {
		return this._valuationTracker.computeValuation(this._getState());
	}

	getPrice(): Price {
		return this._price;
	}

	getPnL(): number {
		return this._valuationTracker.computePnL(this._getState());
	}

	getMetrics(): WalletMetrics {
		return computeWalletMetrics({
			cash: this._cash,
			position: this._position,
			price: this._price,
			peakValuation: this._valuationTracker.getPeakValuation(),
			initialCash: this._config.initialCash,
			totalFeesPaid: this._tradeHistory.getTotalFeesPaid(),
			tradeCount: this._tradeHistory.getTradeCount(),
			decimals: this._config.decimals,
		});
	}

	getHistory(): Readonly<TradeRecord[]> {
		return this._tradeHistory.getHistory();
	}

	reset(): void {
		this._price = this._config.initialPrice;
		this._cash = this._config.initialCash;
		this._position = Volume.zero();
		this._valuationTracker.reset();
		this._tradeHistory.reset();
	}
}

export const createWallet = (params: WalletConfigParams): WalletAPI =>
	new Wallet(params);
