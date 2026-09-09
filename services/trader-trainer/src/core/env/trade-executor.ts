import {
	Cash,
	type Price,
	Volume,
} from "@trading-model/common/domain/primitives";
import { TradeSide } from "@trading-model/validation/shared/contracts/market-data.types";
import type { PortfolioState } from "./portfolio-state";
import type { TradeRecorder } from "./trade-recorder";
import type { WalletConfig } from "./wallet-config";

export class TradeExecutor {
	private _state: PortfolioState;

	constructor(
		private readonly _config: WalletConfig,
		private readonly _recorder: TradeRecorder,
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
	buy(amount: Volume): boolean {
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
		const { totalCost, fee } = this._config.computeBuyCosts(
			amount,
			this._state.price
		);
		if (Cash.gt(totalCost, this._state.cash)) {
			return false;
		}
		const cashAfterBuy = Cash.of(
			this._config.roundValue(Cash.sub(this._state.cash, totalCost))
		);
		return this._commitTrade(
			TradeSide.Buy,
			amount,
			fee,
			newPosition,
			cashAfterBuy
		);
	}
	sell(amount: Volume): boolean {
		const amt = Volume.toNumber(amount);
		if (!Number.isFinite(amt) || amt <= 0 || amt > this._state.position) {
			return false;
		}
		const { netProceeds, fee } = this._config.computeSellProceeds(
			amount,
			this._state.price
		);
		const positionAfterSell = Volume.of(
			this._config.roundValue(this._state.position - amt)
		);
		const cashAfterSell = Cash.of(
			this._config.roundValue(Cash.add(this._state.cash, netProceeds))
		);
		return this._commitTrade(
			TradeSide.Sell,
			amount,
			fee,
			positionAfterSell,
			cashAfterSell
		);
	}

	private _commitTrade(
		action: TradeSide,
		amount: Volume,
		fee: Cash,
		positionAfter: Volume,
		cashAfter: Cash
	): boolean {
		this._state = { ...this._state, position: positionAfter, cash: cashAfter };
		this._recorder.recordTrade({
			action,
			amount,
			fee: Cash.of(this._config.roundValue(fee)),
			price: this._state.price,
			cashAfter: this._state.cash,
			positionAfter: this._state.position,
		});
		return true;
	}
	setPrice(newPrice: Price): void {
		if (!Number.isFinite(newPrice) || newPrice <= 0) {
			throw new Error(`setPrice received invalid value: ${newPrice}`);
		}
		this._state = { ...this._state, price: newPrice };
		this._recorder.incrementStep();
		this._recorder.recordValuation(this._state);
	}
	reset(): void {
		this._state = {
			price: this._config.initialPrice,
			cash: this._config.initialCash,
			position: Volume.zero(),
		};
		this._recorder.reset();
	}
}
