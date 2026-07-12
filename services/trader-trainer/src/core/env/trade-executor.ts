import {
	Cash,
	type Price,
	Volume,
} from "@trading-model/common/domain/primitives";
import { TradeSide } from "@trading-model/validation/contracts/market-data.types";
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
	get config(): WalletConfig {
		return this._config;
	}
	get recorder(): TradeRecorder {
		return this._recorder;
	}

	buy(amount: Volume): boolean {
		const amt = Number(amount);
		if (!Number.isFinite(amt) || amt <= 0) {
			return false;
		}
		const newPosition = Volume.of(
			this._config.roundValue(Number(this._state.position) + amt)
		);
		if (Number(newPosition) > Number(this._config.maxPosition)) {
			return false;
		}
		const { totalCost, fee } = this._config.computeBuyCosts(
			amount,
			this._state.price
		);
		if (Number(totalCost) > Number(this._state.cash)) {
			return false;
		}
		const cashAfterBuy = Cash.of(
			this._config.roundValue(Number(this._state.cash) - Number(totalCost))
		);
		this._state = { ...this._state, position: newPosition, cash: cashAfterBuy };
		this._recorder.recordTrade({
			action: TradeSide.Buy,
			amount,
			fee: Cash.of(this._config.roundValue(Number(fee))),
			price: this._state.price,
			cashAfter: this._state.cash,
			positionAfter: this._state.position,
		});
		return true;
	}
	sell(amount: Volume): boolean {
		const amt = Number(amount);
		if (
			!Number.isFinite(amt) ||
			amt <= 0 ||
			amt > Number(this._state.position)
		) {
			return false;
		}
		const { netProceeds, fee } = this._config.computeSellProceeds(
			amount,
			this._state.price
		);
		const positionAfterSell = Volume.of(
			this._config.roundValue(Number(this._state.position) - amt)
		);
		const cashAfterSell = Cash.of(
			this._config.roundValue(Number(this._state.cash) + netProceeds)
		);
		this._state = {
			...this._state,
			position: positionAfterSell,
			cash: cashAfterSell,
		};
		this._recorder.recordTrade({
			action: TradeSide.Sell,
			amount,
			fee: Cash.of(this._config.roundValue(Number(fee))),
			price: this._state.price,
			cashAfter: this._state.cash,
			positionAfter: this._state.position,
		});
		return true;
	}
	setPrice(newPrice: Price): void {
		if (!Number.isFinite(Number(newPrice)) || Number(newPrice) <= 0) {
			throw new Error(`setPrice received invalid value: ${newPrice}`);
		}
		this._state = { ...this._state, price: newPrice };
		this._recorder.incrementStep();
		this._recorder.recordValuation(this);
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
