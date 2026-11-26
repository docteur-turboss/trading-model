import { Cash, type Price, Volume } from "@trading-model/primitives/primitives";
import { WalletConfig, type WalletConfigParams } from "./wallet-config";

/**
 * Wallet over several assets sharing one cash balance (ADR-0076 step 4).
 * Costs, rounding and the per-asset exposure cap are those of the single-asset
 * wallet (ADR-0066): with one asset both give the same results.
 * `initialPrice` of the params only seeds every asset; use `setPrice`.
 */
export class MultiAssetWallet {
	private readonly _config: WalletConfig;
	private readonly _positions = new Map<string, number>();
	private readonly _prices = new Map<string, number>();
	private _cash: number;
	private _feesPaid = 0;
	private _executionCostPaid = 0;

	constructor(
		_params: WalletConfigParams,
		readonly assets: readonly string[]
	) {
		if (assets.length === 0 || new Set(assets).size !== assets.length) {
			throw new Error("assets must be a non-empty list without duplicates");
		}
		this._config = new WalletConfig(_params);
		this._cash = this._config.initialCash;
		this.reset();
	}

	get cash(): Cash {
		return Cash.of(this._cash);
	}
	get costsPaid(): { feesPaid: number; executionCostPaid: number } {
		return {
			feesPaid: this._feesPaid,
			executionCostPaid: this._executionCostPaid,
		};
	}
	position(asset: string): Volume {
		return Volume.of(this._positions.get(this._known(asset)) ?? 0);
	}
	/** Cash plus every position at its marked price. */
	valuation(): Cash {
		let total = this._cash;
		for (const [asset, position] of this._positions) {
			total += position * (this._prices.get(asset) as number);
		}
		return Cash.of(this._config.roundValue(total));
	}

	setPrice(asset: string, price: Price): void {
		if (!Number.isFinite(price) || price <= 0) {
			throw new Error(`setPrice received invalid value: ${price}`);
		}
		this._prices.set(this._known(asset), price);
	}

	/** Buys `amount` of `asset` at `fillPrice` (default: marked price), costs included. */
	buy(asset: string, amount: Volume, fillPrice?: Price): boolean {
		const held = this._positions.get(this._known(asset)) as number;
		const price = fillPrice ?? (this._prices.get(asset) as number);
		if (!Number.isFinite(amount) || amount <= 0) {
			return false;
		}
		this._validFill(price);
		const maxPosition =
			(this._config.maxExposureFraction * this._config.initialCash) / price;
		const bought = this._config.roundValue(
			Math.min(amount, maxPosition - held)
		);
		if (bought <= 0) {
			return false;
		}
		const { totalCost, fee, executionCost } = this._config.computeBuyCosts(
			Volume.of(bought),
			price as Price
		);
		if (totalCost > this._cash) {
			return false;
		}
		this._cash = this._config.roundValue(this._cash - totalCost);
		this._positions.set(asset, this._config.roundValue(held + bought));
		this._addCosts(fee, executionCost);
		return true;
	}

	/** Sells `amount` of `asset` at `fillPrice` (default: marked price), costs included. */
	sell(asset: string, amount: Volume, fillPrice?: Price): boolean {
		const held = this._positions.get(this._known(asset)) as number;
		const price = fillPrice ?? (this._prices.get(asset) as number);
		if (!Number.isFinite(amount) || amount <= 0 || amount > held) {
			return false;
		}
		this._validFill(price);
		const { netProceeds, fee, executionCost } =
			this._config.computeSellProceeds(amount, price as Price);
		this._cash = this._config.roundValue(this._cash + netProceeds);
		this._positions.set(asset, this._config.roundValue(held - amount));
		this._addCosts(fee, executionCost);
		return true;
	}

	reset(): void {
		this._cash = this._config.initialCash;
		this._feesPaid = 0;
		this._executionCostPaid = 0;
		for (const asset of this.assets) {
			this._positions.set(asset, 0);
			this._prices.set(asset, this._config.initialPrice);
		}
	}

	private _known(asset: string): string {
		if (!this._positions.has(asset)) {
			throw new Error(`unknown asset: ${asset}`);
		}
		return asset;
	}
	private _validFill(price: number): void {
		if (!Number.isFinite(price) || price <= 0) {
			throw new Error(`fill price received invalid value: ${price}`);
		}
	}
	private _addCosts(fee: Cash, executionCost: Cash): void {
		this._feesPaid = this._config.roundValue(this._feesPaid + fee);
		this._executionCostPaid = this._config.roundValue(
			this._executionCostPaid + executionCost
		);
	}
}
