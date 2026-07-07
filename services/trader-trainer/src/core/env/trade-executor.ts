import { Cash, type Price, Volume } from "@trading-model/common/domain/primitives";
import { TradeSide } from "@trading-model/common/contracts/market-data.types";
import type { TradeRecorder } from "./trade-recorder";
import type { WalletConfig } from "./wallet-config";

export class TradeExecutor {
	constructor(
		private readonly _config: WalletConfig,
		private readonly _recorder: TradeRecorder,
		private _price: Price,
		private _cash: Cash,
		private _position: Volume
	) {}

	get price(): Price { return this._price; 	}
	get cash(): Cash { return this._cash; }
	get position(): Volume { return this._position; }
	get config(): WalletConfig { return this._config; }
	get recorder(): TradeRecorder { return this._recorder; }

	buy(amount: Volume): boolean {
		const amt = Number(amount);
		if (!Number.isFinite(amt) || amt <= 0) return false;
		const newPosition = Volume.of(this._config.roundValue(Number(this._position) + amt));
		if (Number(newPosition) > Number(this._config.maxPosition)) return false;
		const { totalCost, fee } = this._config.computeBuyCosts(amount, this._price);
		if (Number(totalCost) > Number(this._cash)) return false;
		this._position = newPosition;
		this._cash = Cash.of(this._config.roundValue(Number(this._cash) - Number(totalCost)));
		this._recorder.recordTrade({ action: TradeSide.BUY, amount, fee: Cash.of(this._config.roundValue(Number(fee))), price: this._price, cashAfter: this._cash, positionAfter: this._position });
		return true;
	}
	sell(amount: Volume): boolean {
		const amt = Number(amount);
		if (!Number.isFinite(amt) || amt > Number(this._position)) return false;
		const { netProceeds, fee } = this._config.computeSellProceeds(amount, this._price);
		this._position = Volume.of(this._config.roundValue(Number(this._position) - amt));
		this._cash = Cash.of(this._config.roundValue(Number(this._cash) + netProceeds));
		this._recorder.recordTrade({ action: TradeSide.SELL, amount, fee: Cash.of(this._config.roundValue(Number(fee))), price: this._price, cashAfter: this._cash, positionAfter: this._position });
		return true;
	}
	setPrice(newPrice: Price): void {
		if (!Number.isFinite(Number(newPrice)) || Number(newPrice) <= 0) throw new Error(`setPrice received invalid value: ${newPrice}`);
		this._price = newPrice;
		this._recorder.incrementStep();
		this._recorder.recordValuation({ cash: this._cash, position: this._position, price: this._price });
	}
	reset(): void {
		this._price = this._config.initialPrice;
		this._cash = this._config.initialCash;
		this._position = Volume.zero();
		this._recorder.reset();
	}
}
