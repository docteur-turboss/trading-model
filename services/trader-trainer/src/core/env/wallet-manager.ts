import {
	Cash,
	Percentage,
	Price,
	Volume,
} from "@trading-model/common/domain/primitives";
import { TradeHistory, type TradeRecord } from "./trade-history";
import { computeWalletMetrics, type WalletMetrics } from "./wallet-metrics";

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

function _validateInitialCash(initialCash: Cash): void {
	if (!Number.isFinite(+initialCash) || +initialCash < 0) {
		throw new Error(`Invalid initialCash: ${initialCash}`);
	}
}

function _validateInitialPrice(initialPrice: Price): void {
	if (!Number.isFinite(+initialPrice) || +initialPrice <= 0) {
		throw new Error(`Invalid initialPrice: ${initialPrice}`);
	}
}

function _validateFeeRate(feeRate: Percentage): void {
	if (!Number.isFinite(+feeRate) || +feeRate < 0 || +feeRate >= 1) {
		throw new Error(`Invalid feeRate: ${feeRate}. Must be in [0, 1[`);
	}
}

function _validateMaxPosition(maxPosition: Volume): void {
	if (+maxPosition <= 0) {
		throw new Error(`Invalid maxPosition: ${maxPosition}`);
	}
}

function _validateDecimals(decimals: number): void {
	if (!Number.isInteger(decimals) || decimals < 1 || decimals > 15) {
		throw new Error(
			`Invalid decimals: ${decimals}. Must be an integer in [1, 15]`
		);
	}
}

function _roundValue(value: number, decimals: number): number {
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
}

function validateConfig(config: Required<WalletConfig>): void {
	_validateInitialCash(config.initialCash);
	_validateInitialPrice(config.initialPrice);
	_validateFeeRate(config.feeRate);
	_validateMaxPosition(config.maxPosition);
	_validateDecimals(config.decimals);
}

function computeBuyCosts(
	amount: Volume,
	price: Price,
	feeRate: Percentage,
	decimals: number
): { totalCost: Cash; fee: Cash } {
	const baseCost = _roundValue(+amount * +price, decimals);
	const fee = Cash.of(_roundValue(baseCost * +feeRate, decimals));
	const totalCost = Cash.of(_roundValue(baseCost + +fee, decimals));
	return { totalCost, fee };
}

function computeSellProceeds(
	amount: number,
	price: Price,
	feeRate: Percentage,
	decimals: number
): { netProceeds: number; fee: Cash } {
	const baseProceeds = _roundValue(amount * +price, decimals);
	const fee = Cash.of(_roundValue(baseProceeds * +feeRate, decimals));
	const netProceeds = _roundValue(baseProceeds - +fee, decimals);
	return { netProceeds, fee };
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
	private readonly _valuationHistory: number[] = [];
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
		this._valuationHistory.push(+resolved.initialCash);
	}

	private _valuation(): Cash {
		return Cash.of(
			_roundValue(+this._cash + +this._position * +this._price, this._decimals)
		);
	}

	private _recordValuation(): void {
		this._valuationHistory.push(+this._valuation());
	}

	buy(amount: Volume): boolean {
		const amt = +amount;
		if (!Number.isFinite(amt) || amt <= 0) {
			return false;
		}
		const newPosition = Volume.of(
			_roundValue(+this._position + amt, this._decimals)
		);
		if (+newPosition > +this._maxPosition) {
			return false;
		}
		const { totalCost, fee } = computeBuyCosts(
			amount,
			this._price,
			this._feeRate,
			this._decimals
		);
		if (+totalCost > +this._cash) {
			return false;
		}
		this._position = newPosition;
		this._cash = Cash.of(_roundValue(+this._cash - +totalCost, this._decimals));
		this._recordTrade("buy", amount, fee);
		return true;
	}

	sell(amount: Volume): boolean {
		const amt = +amount;
		if (!Number.isFinite(amt) || amt <= 0 || amt > +this._position) {
			return false;
		}
		const { netProceeds, fee } = computeSellProceeds(
			amt,
			this._price,
			this._feeRate,
			this._decimals
		);
		this._position = Volume.of(
			_roundValue(+this._position - amt, this._decimals)
		);
		this._cash = Cash.of(
			_roundValue(+this._cash + netProceeds, this._decimals)
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
			fee: Cash.of(_roundValue(+fee, this._decimals)),
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
		return this._valuation();
	}

	getPrice(): Price {
		return this._price;
	}

	getPnL(): number {
		return _roundValue(+this._valuation() - +this._initialCash, this._decimals);
	}

	getMetrics(): WalletMetrics {
		const peakValuation =
			this._valuationHistory.length > 0
				? Cash.of(Math.max(...this._valuationHistory))
				: this._initialCash;
		return computeWalletMetrics({
			cash: this._cash,
			position: +this._position,
			price: this._price,
			peakValuation,
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
		this._valuationHistory.length = 0;
		this._valuationHistory.push(+this._initialCash);
		this._tradeHistory.reset();
	}
}

export const createWallet = (config: WalletConfig): WalletAPI =>
	new Wallet(config);
