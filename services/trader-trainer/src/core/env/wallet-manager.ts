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

export interface WalletMetrics {
	pnl: number;
	returnRate: number;
	peakValuation: number;
	drawdown: number;
	totalFeesPaid: number;
	tradeCount: number;
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

function validateConfig(config: Required<WalletConfig>): void {
	const { initialCash, initialPrice, feeRate, maxPosition, decimals } = config;
	if (!Number.isFinite(initialCash) || initialCash < 0) {
		throw new Error(`Invalid initialCash: ${initialCash}`);
	}
	if (!Number.isFinite(initialPrice) || initialPrice <= 0) {
		throw new Error(`Invalid initialPrice: ${initialPrice}`);
	}
	if (!Number.isFinite(feeRate) || feeRate < 0 || feeRate >= 1) {
		throw new Error(`Invalid feeRate: ${feeRate}. Must be in [0, 1[`);
	}
	if (maxPosition <= 0) {
		throw new Error(`Invalid maxPosition: ${maxPosition}`);
	}
	if (!Number.isInteger(decimals) || decimals < 1 || decimals > 15) {
		throw new Error(
			`Invalid decimals: ${decimals}. Must be an integer in [1, 15]`
		);
	}
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
		validateConfig({
			initialCash,
			initialPrice,
			feeRate,
			maxPosition,
			decimals,
		});
		this._initialCash = initialCash;
		this._initialPrice = initialPrice;
		this._feeRate = feeRate;
		this._maxPosition = maxPosition;
		this._decimals = decimals;
		this._price = initialPrice;
		this._cash = initialCash;
		this._peakValuation = initialCash;
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
		const baseCost = this._round(amount * this._price);
		const fee = this._round(baseCost * this._feeRate);
		const totalCost = this._round(baseCost + fee);
		if (totalCost > this._cash) {
			return false;
		}
		this._position = newPosition;
		this._cash = this._round(this._cash - totalCost);
		this._totalFeesPaid = this._round(this._totalFeesPaid + fee);
		this._tradeCount++;
		this._updatePeak();
		this._history.push({
			step: this._step,
			action: "buy",
			amount,
			price: this._price,
			fee,
			cashAfter: this._cash,
			positionAfter: this._position,
		});
		return true;
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
		this._totalFeesPaid = this._round(this._totalFeesPaid + fee);
		this._tradeCount++;
		this._updatePeak();
		this._history.push({
			step: this._step,
			action: "sell",
			amount,
			price: this._price,
			fee,
			cashAfter: this._cash,
			positionAfter: this._position,
		});
		return true;
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
		const valuation = this._valuation();
		return {
			pnl: this._round(valuation - this._initialCash),
			returnRate: this._round(
				(valuation - this._initialCash) / this._initialCash
			),
			peakValuation: this._peakValuation,
			drawdown:
				this._peakValuation > 0
					? this._round((this._peakValuation - valuation) / this._peakValuation)
					: 0,
			totalFeesPaid: this._totalFeesPaid,
			tradeCount: this._tradeCount,
		};
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
