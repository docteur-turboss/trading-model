import { Cash, Percentage, Price, Volume } from "@trading-model/common/domain/primitives";
import { type PortfolioState } from "./portfolio-state";
import { TradeHistory, type TradeRecord } from "./trade-history";
import { ValuationTracker } from "./valuation-tracker";
import { computeWalletMetrics, type WalletMetrics } from "./wallet-metrics";
import { validateConfig } from "./wallet-validation";
import { computeBuyCosts, computeSellProceeds, roundValue } from "./wallet-costs";

export type { TradeRecord, WalletMetrics };

export interface WalletConfig {
	initialCash: Cash;
	initialPrice: Price;
	feeRate?: Percentage;
	maxPosition?: Volume;
	decimals?: number;
}

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
	private readonly _initialCash: Cash;
	private readonly _initialPrice: Price;
	private readonly _feeRate: Percentage;
	private readonly _maxPosition: Volume;
	private readonly _decimals: number;

	private _price: Price;
	private _cash: Cash;
	private _position: Volume = Volume.zero();
	private readonly _valuationTracker: ValuationTracker;
	private readonly _tradeHistory = new TradeHistory();

	constructor(config: WalletConfig) {
		const {
			initialCash,
			initialPrice,
			feeRate = Percentage.zero(),
			maxPosition = Volume.of(Number.MAX_VALUE),
			decimals = 8,
		} = config;
		const resolved: Required<WalletConfig> = {
			initialCash: Cash.of(+initialCash),
			initialPrice: Price.of(+initialPrice),
			feeRate: Percentage.of(+feeRate),
			maxPosition: Volume.of(+maxPosition),
			decimals,
		};
		validateConfig(resolved);
		this._initialCash = resolved.initialCash;
		this._initialPrice = resolved.initialPrice;
		this._feeRate = resolved.feeRate;
		this._maxPosition = resolved.maxPosition;
		this._decimals = resolved.decimals;
		this._price = resolved.initialPrice;
		this._cash = resolved.initialCash;
		this._valuationTracker = new ValuationTracker(resolved.initialCash, resolved.decimals);
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
			roundValue(+this._position + amt, this._decimals)
		);
		if (+newPosition > +this._maxPosition) {
			return false;
		}
		const { totalCost, fee } = computeBuyCosts({
			amount,
			price: this._price,
			feeRate: this._feeRate,
			decimals: this._decimals,
		});
		if (+totalCost > +this._cash) {
			return false;
		}
		this._position = newPosition;
		this._cash = Cash.of(roundValue(+this._cash - +totalCost, this._decimals));
		this._recordTrade("buy", amount, fee);
		return true;
	}

	sell(amount: Volume): boolean {
		const amt = +amount;
		if (!Number.isFinite(amt) || amt <= 0 || amt > +this._position) {
			return false;
		}
		const { netProceeds, fee } = computeSellProceeds({
			amount,
			price: this._price,
			feeRate: this._feeRate,
			decimals: this._decimals,
		});
		this._position = Volume.of(
			roundValue(+this._position - amt, this._decimals)
		);
		this._cash = Cash.of(
			roundValue(+this._cash + netProceeds, this._decimals)
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
			fee: Cash.of(roundValue(+fee, this._decimals)),
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
			initialCash: this._initialCash,
			totalFeesPaid: this._tradeHistory.getTotalFeesPaid(),
			tradeCount: this._tradeHistory.getTradeCount(),
			decimals: this._decimals,
		});
	}

	getHistory(): Readonly<TradeRecord[]> {
		return this._tradeHistory.getHistory();
	}

	reset(): void {
		this._price = this._initialPrice;
		this._cash = this._initialCash;
		this._position = Volume.zero();
		this._valuationTracker.reset();
		this._tradeHistory.reset();
	}
}

export const createWallet = (config: WalletConfig): WalletAPI =>
	new Wallet(config);
