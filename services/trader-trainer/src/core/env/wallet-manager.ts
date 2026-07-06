import { Price, Volume, Percentage } from "@trading-model/common/domain/primitives";
import { computeWalletMetrics, type WalletMetrics } from "./wallet-metrics";
import { TradeHistory, type TradeRecord } from "./trade-history";

export type { WalletMetrics };
export type { TradeRecord };

export interface WalletConfig {
	initialCash: number;
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
	getCash: () => number;
	getValuation: () => number;
	getPrice: () => Price;
	getPnL: () => number;
	getMetrics: () => WalletMetrics;
	getHistory: () => Readonly<TradeRecord[]>;
	reset: () => void;
}

function _validateInitialCash(initialCash: number): void {
	if (!Number.isFinite(initialCash) || initialCash < 0) {
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

function validateConfig(config: Required<WalletConfig>): void {
	_validateInitialCash(config.initialCash);
	_validateInitialPrice(config.initialPrice);
	_validateFeeRate(config.feeRate);
	_validateMaxPosition(config.maxPosition);
	_validateDecimals(config.decimals);
}

export class Wallet implements WalletAPI {
	private readonly _initialCash: number;
	private readonly _initialPrice: Price;
	private readonly _feeRate: Percentage;
	private readonly _maxPosition: Volume;
	private readonly _decimals: number;

	private _price: Price;
	private _cash: number;
	private _position: Volume = Volume.zero();
	private _peakValuation: number;
	private readonly _tradeHistory = new TradeHistory();

	constructor(config: WalletConfig) {
		const {
			initialCash,
			initialPrice,
			feeRate = Percentage.zero(),
			maxPosition = Volume.of(Number.MAX_VALUE),
			decimals = 8,
		} = config;
		const resolved: Required<WalletConfig> = { initialCash, initialPrice: Price.of(+initialPrice), feeRate: Percentage.of(+feeRate), maxPosition: Volume.of(+maxPosition), decimals };
		validateConfig(resolved);
		this._initialCash = resolved.initialCash;
		this._initialPrice = resolved.initialPrice;
		this._feeRate = resolved.feeRate;
		this._maxPosition = resolved.maxPosition;
		this._decimals = resolved.decimals;
		this._price = resolved.initialPrice;
		this._cash = resolved.initialCash;
		this._peakValuation = resolved.initialCash;
	}

	private _round(value: number): number {
		const factor = 10 ** this._decimals;
		return Math.round(value * factor) / factor;
	}

	private _valuation(): number {
		return this._round(this._cash + +this._position * +this._price);
	}

	private _updatePeak(): void {
		const val = this._valuation();
		if (val > this._peakValuation) {
			this._peakValuation = val;
		}
	}

	buy(amount: Volume): boolean {
		const amt = +amount;
		if (!Number.isFinite(amt) || amt <= 0) {
			return false;
		}
		const newPosition = Volume.of(this._round(+this._position + amt));
		if (+newPosition > +this._maxPosition) {
			return false;
		}
		const { totalCost, fee } = this._computeBuyCosts(amount);
		if (totalCost > this._cash) {
			return false;
		}
		this._position = newPosition;
		this._cash = this._round(this._cash - totalCost);
		this._recordTrade("buy", amount, fee);
		return true;
	}

	private _computeBuyCosts(amount: Volume): { totalCost: number; fee: number } {
		const baseCost = this._round(+amount * +this._price);
		const fee = this._round(baseCost * +this._feeRate);
		const totalCost = this._round(baseCost + fee);
		return { totalCost, fee };
	}

	sell(amount: Volume): boolean {
		const amt = +amount;
		if (!Number.isFinite(amt) || amt <= 0 || amt > +this._position) {
			return false;
		}
		const baseProceeds = this._round(amt * +this._price);
		const fee = this._round(baseProceeds * +this._feeRate);
		const netProceeds = this._round(baseProceeds - fee);
		this._position = Volume.of(this._round(+this._position - amt));
		this._cash = this._round(this._cash + netProceeds);
		this._recordTrade("sell", amount, fee);
		return true;
	}

	private _recordTrade(
		action: "buy" | "sell",
		amount: Volume,
		fee: number
	): void {
		this._tradeHistory.record(
			action,
			amount,
			this._round(fee),
			this._price,
			this._cash,
			this._position,
		);
		this._updatePeak();
	}

	setPrice(newPrice: Price): void {
		if (!Number.isFinite(+newPrice) || +newPrice <= 0) {
			throw new Error(`setPrice received invalid value: ${newPrice}`);
		}
		this._price = newPrice;
		this._tradeHistory.incrementStep();
		this._updatePeak();
	}

	getPosition(): Volume {
		return this._position;
	}

	getCash(): number {
		return this._cash;
	}

	getValuation(): number {
		return this._valuation();
	}

	getPrice(): Price {
		return this._price;
	}

	getPnL(): number {
		return this._round(this._valuation() - this._initialCash);
	}

	getMetrics(): WalletMetrics {
		return computeWalletMetrics({
			cash: this._cash,
			position: +this._position,
			price: +this._price,
			peakValuation: this._peakValuation,
			initialCash: this._initialCash,
			totalFeesPaid: this._totalFeesPaid,
			tradeCount: this._tradeCount,
			decimals: this._decimals,
		});
	}

	getHistory(): Readonly<TradeRecord[]> {
		return this._history;
	}

	reset(): void {
		this._price = this._initialPrice;
		this._cash = this._initialCash;
		this._position = Volume.zero();
		this._peakValuation = this._initialCash;
		this._totalFeesPaid = 0;
		this._tradeCount = 0;
		this._step = 0;
		this._history.length = 0;
	}
}

export const createWallet = (config: WalletConfig): WalletAPI =>
	new Wallet(config);
