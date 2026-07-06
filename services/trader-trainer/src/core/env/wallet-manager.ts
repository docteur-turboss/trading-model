import { computeWalletMetrics, type WalletMetrics } from "./wallet-metrics";

export type { WalletMetrics };

export interface WalletConfig {
	initialCash: number;
	initialPrice: number;
	feeRate?: number;
	maxPosition?: number;
	decimals?: number;
}

export interface TradeRecord {
	step: number;
	action: "buy" | "sell";
	amount: number;
	price: number;
	fee: number;
	cashAfter: number;
	positionAfter: number;
}

export interface WalletAPI {
	buy: (amount: number) => boolean;
	sell: (amount: number) => boolean;
	setPrice: (newPrice: number) => void;
	getPosition: () => number;
	getCash: () => number;
	getValuation: () => number;
	getPrice: () => number;
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

function _validateInitialPrice(initialPrice: number): void {
	if (!Number.isFinite(initialPrice) || initialPrice <= 0) {
		throw new Error(`Invalid initialPrice: ${initialPrice}`);
	}
}

function _validateFeeRate(feeRate: number): void {
	if (!Number.isFinite(feeRate) || feeRate < 0 || feeRate >= 1) {
		throw new Error(`Invalid feeRate: ${feeRate}. Must be in [0, 1[`);
	}
}

function _validateMaxPosition(maxPosition: number): void {
	if (maxPosition <= 0) {
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
	private readonly _initialPrice: number;
	private readonly _feeRate: number;
	private readonly _maxPosition: number;
	private readonly _decimals: number;

	private _price: number;
	private _cash: number;
	private _position = 0;
	private _peakValuation: number;
	private _totalFeesPaid = 0;
	private _tradeCount = 0;
	private _step = 0;
	private readonly _history: TradeRecord[] = [];

	constructor(config: WalletConfig) {
		const {
			initialCash,
			initialPrice,
			feeRate = 0,
			maxPosition = Number.POSITIVE_INFINITY,
			decimals = 8,
		} = config;
		const resolved = { initialCash, initialPrice, feeRate, maxPosition, decimals };
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
		return this._round(this._cash + this._position * this._price);
	}

	private _updatePeak(): void {
		const val = this._valuation();
		if (val > this._peakValuation) {
			this._peakValuation = val;
		}
	}

	buy(amount: number): boolean {
		if (!Number.isFinite(amount) || amount <= 0) {
			return false;
		}
		const newPosition = this._round(this._position + amount);
		if (newPosition > this._maxPosition) {
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

	private _computeBuyCosts(amount: number): { totalCost: number; fee: number } {
		const baseCost = this._round(amount * this._price);
		const fee = this._round(baseCost * this._feeRate);
		const totalCost = this._round(baseCost + fee);
		return { totalCost, fee };
	}

	sell(amount: number): boolean {
		if (!Number.isFinite(amount) || amount <= 0 || amount > this._position) {
			return false;
		}
		const baseProceeds = this._round(amount * this._price);
		const fee = this._round(baseProceeds * this._feeRate);
		const netProceeds = this._round(baseProceeds - fee);
		this._position = this._round(this._position - amount);
		this._cash = this._round(this._cash + netProceeds);
		this._recordTrade("sell", amount, fee);
		return true;
	}

	private _recordTrade(
		action: "buy" | "sell",
		amount: number,
		fee: number
	): void {
		this._totalFeesPaid = this._round(this._totalFeesPaid + fee);
		this._tradeCount++;
		this._updatePeak();
		this._history.push({
			step: this._step,
			action,
			amount,
			price: this._price,
			fee,
			cashAfter: this._cash,
			positionAfter: this._position,
		});
	}

	setPrice(newPrice: number): void {
		if (!Number.isFinite(newPrice) || newPrice <= 0) {
			throw new Error(`setPrice received invalid value: ${newPrice}`);
		}
		this._price = newPrice;
		this._step++;
		this._updatePeak();
	}

	getPosition(): number {
		return this._position;
	}

	getCash(): number {
		return this._cash;
	}

	getValuation(): number {
		return this._valuation();
	}

	getPrice(): number {
		return this._price;
	}

	getPnL(): number {
		return this._round(this._valuation() - this._initialCash);
	}

	getMetrics(): WalletMetrics {
		return computeWalletMetrics({
			cash: this._cash,
			position: this._position,
			price: this._price,
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
		this._position = 0;
		this._peakValuation = this._initialCash;
		this._totalFeesPaid = 0;
		this._tradeCount = 0;
		this._step = 0;
		this._history.length = 0;
	}
}

export const createWallet = (config: WalletConfig): WalletAPI =>
	new Wallet(config);
