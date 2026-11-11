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
	/** Buys `amount` at `fillPrice` (default: the marked price), costs included. */
	buy(amount: Volume, fillPrice: Price = this._state.price): boolean {
		const amt = Volume.toNumber(amount);
		if (!Number.isFinite(amt) || amt <= 0) {
			return false;
		}
		const newPosition = Volume.of(
			this._config.roundValue(this._state.position + amt)
		);
		if (Volume.gt(newPosition, this._config.maxPosition)) {
			return false;
		}
		const { totalCost } = this._config.computeBuyCosts(
			amount,
			validFillPrice(fillPrice)
		);
		if (Cash.gt(totalCost, this._state.cash)) {
			return false;
		}
		const cashAfterBuy = Cash.of(
			this._config.roundValue(Cash.sub(this._state.cash, totalCost))
		);
		this._commitTrade(newPosition, cashAfterBuy);
		return true;
	}
	/** Sells `amount` at `fillPrice` (default: the marked price), costs included. */
	sell(amount: Volume, fillPrice: Price = this._state.price): boolean {
		const amt = Volume.toNumber(amount);
		if (!Number.isFinite(amt) || amt <= 0 || amt > this._state.position) {
			return false;
		}
		const { netProceeds } = this._config.computeSellProceeds(
			amount,
			validFillPrice(fillPrice)
		);
		const positionAfterSell = Volume.of(
			this._config.roundValue(this._state.position - amt)
		);
		const cashAfterSell = Cash.of(
			this._config.roundValue(Cash.add(this._state.cash, netProceeds))
		);
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
		this._state = {
			price: this._config.initialPrice,
			cash: this._config.initialCash,
			position: Volume.zero(),
		};
	}
}
