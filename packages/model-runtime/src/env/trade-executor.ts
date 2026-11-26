import { Cash, type Price, Volume } from "@trading-model/primitives/primitives";
import type { PortfolioState } from "./portfolio-state";
import type { WalletConfig } from "./wallet-config";

function validFillPrice(price: Price): Price {
	if (!Number.isFinite(price) || price <= 0) {
		throw new Error(`fill price received invalid value: ${price}`);
	}
	return price;
}

export class TradeExecutor {
	private _state: PortfolioState;
	private _feesPaid = 0;
	private _executionCostPaid = 0;

	constructor(
		private readonly _config: WalletConfig,
		initialState: PortfolioState
	) {
		this._state = initialState;
	}

	get price(): Price {
		return this._state.price;
	}
	get cash(): Cash {
		return this._state.cash;
	}
	get position(): Volume {
		return this._state.position;
	}
	/** Fees and execution cost paid since the last reset, in quote currency. */
	get costsPaid(): { feesPaid: number; executionCostPaid: number } {
		return {
			feesPaid: this._feesPaid,
			executionCostPaid: this._executionCostPaid,
		};
	}
	private _addCosts(fee: Cash, executionCost: Cash): void {
		this._feesPaid = this._config.roundValue(this._feesPaid + fee);
		this._executionCostPaid = this._config.roundValue(
			this._executionCostPaid + executionCost
		);
	}
	/** Buys `amount` at `fillPrice` (default: the marked price), costs included. */
	buy(amount: Volume, fillPrice: Price = this._state.price): boolean {
		const amt = Volume.toNumber(amount);
		if (!Number.isFinite(amt) || amt <= 0) {
			return false;
		}
		const price = validFillPrice(fillPrice);
		// Reduce a buy to what the exposure cap allows at the fill price; refuse when nothing is left.
		const maxPosition =
			(this._config.maxExposureFraction * this._config.initialCash) / price;
		const bought = this._config.roundValue(
			Math.min(amt, maxPosition - this._state.position)
		);
		if (bought <= 0) {
			return false;
		}
		const newPosition = Volume.of(
			this._config.roundValue(this._state.position + bought)
		);
		const { totalCost, fee, executionCost } = this._config.computeBuyCosts(
			Volume.of(bought),
			price
		);
		if (Cash.gt(totalCost, this._state.cash)) {
			return false;
		}
		const cashAfterBuy = Cash.of(
			this._config.roundValue(Cash.sub(this._state.cash, totalCost))
		);
		this._addCosts(fee, executionCost);
		this._commitTrade(newPosition, cashAfterBuy);
		return true;
	}
	/** Sells `amount` at `fillPrice` (default: the marked price), costs included. */
	sell(amount: Volume, fillPrice: Price = this._state.price): boolean {
		const amt = Volume.toNumber(amount);
		if (!Number.isFinite(amt) || amt <= 0 || amt > this._state.position) {
			return false;
		}
		const price = validFillPrice(fillPrice);
		const { netProceeds, fee, executionCost } =
			this._config.computeSellProceeds(amount, price);
		const positionAfterSell = Volume.of(
			this._config.roundValue(this._state.position - amt)
		);
		const cashAfterSell = Cash.of(
			this._config.roundValue(Cash.add(this._state.cash, netProceeds))
		);
		this._addCosts(fee, executionCost);
		this._commitTrade(positionAfterSell, cashAfterSell);
		return true;
	}

	private _commitTrade(positionAfter: Volume, cashAfter: Cash): void {
		this._state = { ...this._state, position: positionAfter, cash: cashAfter };
	}
	setPrice(newPrice: Price): void {
		if (!Number.isFinite(newPrice) || newPrice <= 0) {
			throw new Error(`setPrice received invalid value: ${newPrice}`);
		}
		this._state = { ...this._state, price: newPrice };
	}
	reset(): void {
		this._feesPaid = 0;
		this._executionCostPaid = 0;
		this._state = {
			price: this._config.initialPrice,
			cash: this._config.initialCash,
			position: Volume.zero(),
		};
	}
}
