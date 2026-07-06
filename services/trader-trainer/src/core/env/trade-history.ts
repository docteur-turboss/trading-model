import { Price, Volume } from "@trading-model/common/domain/primitives";

export interface TradeRecord {
	step: number;
	action: "buy" | "sell";
	amount: Volume;
	price: Price;
	fee: number;
	cashAfter: number;
	positionAfter: Volume;
}

export class TradeHistory {
	private readonly _history: TradeRecord[] = [];
	private _totalFeesPaid = 0;
	private _tradeCount = 0;
	private _step = 0;

	getStep(): number {
		return this._step;
	}

	incrementStep(): void {
		this._step++;
	}

	getTotalFeesPaid(): number {
		return this._totalFeesPaid;
	}

	getTradeCount(): number {
		return this._tradeCount;
	}

	getHistory(): Readonly<TradeRecord[]> {
		return this._history;
	}

	record(
		action: "buy" | "sell",
		amount: Volume,
		fee: number,
		price: Price,
		cashAfter: number,
		positionAfter: Volume,
	): void {
		this._totalFeesPaid += fee;
		this._tradeCount++;
		this._history.push({
			step: this._step,
			action,
			amount,
			price,
			fee,
			cashAfter,
			positionAfter,
		});
	}

	reset(): void {
		this._history.length = 0;
		this._totalFeesPaid = 0;
		this._tradeCount = 0;
		this._step = 0;
	}
}
