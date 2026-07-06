import { Cash, Price, Volume } from "@trading-model/common/domain/primitives";
import { WalletConfig } from "./wallet-config";
import { TradeRecorder } from "./trade-recorder";

export class TradeExecutor {
	constructor(
		private readonly _config: WalletConfig,
		private _price: Price,
		private _cash: Cash,
		private _position: Volume,
		private readonly _recorder: TradeRecorder,
	) {}

	get price(): Price {
		return this._price;
	}

	set price(value: Price) {
		this._price = value;
	}

	get cash(): Cash {
		return this._cash;
	}

	get position(): Volume {
		return this._position;
	}

	get config(): WalletConfig {
		return this._config;
	}

	get recorder(): TradeRecorder {
		return this._recorder;
	}

	buy(amount: Volume): boolean {
		const amt = +amount;
		if (!Number.isFinite(amt) || amt <= 0) {
			return false;
		}
		const newPosition = Volume.of(
			this._config.roundValue(+this._position + amt)
		);
		if (+newPosition > +this._config.maxPosition) {
			return false;
		}
		const { totalCost, fee } = this._config.computeBuyCosts(amount, this._price);
		if (+totalCost > +this._cash) {
			return false;
		}
		this._position = newPosition;
		this._cash = Cash.of(
			this._config.roundValue(+this._cash - +totalCost)
		);
		this._recorder.recordTrade(
			"buy", amount, Cash.of(this._config.roundValue(+fee)),
			this._price, this._cash, this._position
		);
		return true;
	}

	sell(amount: Volume): boolean {
		const amt = +amount;
		if (!Number.isFinite(amt) || amt <= 0 || amt > +this._position) {
			return false;
		}
		const { netProceeds, fee } = this._config.computeSellProceeds(
			amount,
			this._price
		);
		this._position = Volume.of(
			this._config.roundValue(+this._position - amt)
		);
		this._cash = Cash.of(
			this._config.roundValue(+this._cash + netProceeds)
		);
		this._recorder.recordTrade(
			"sell", amount, Cash.of(this._config.roundValue(+fee)),
			this._price, this._cash, this._position
		);
		return true;
	}

	setPrice(newPrice: Price): void {
		if (!Number.isFinite(+newPrice) || +newPrice <= 0) {
			throw new Error(`setPrice received invalid value: ${newPrice}`);
		}
		this._price = newPrice;
		this._recorder.incrementStep();
		this._recorder.recordValuation(this._cash, this._position, this._price);
	}

	reset(): void {
		this._price = this._config.initialPrice;
		this._cash = this._config.initialCash;
		this._position = Volume.zero();
		this._recorder.reset();
	}
}
