import { Cash, Price, Volume } from "@trading-model/common/domain/primitives";

export interface TradeRecord {
	step: number;
	action: "buy" | "sell";
	amount: Volume;
	price: Price;
	fee: Cash;
	cashAfter: Cash;
	positionAfter: Volume;
}

export class TradeHistory {
	private readonly _history: TradeRecord[] = [];
	private _totalFeesPaid: Cash = Cash.zero();
	private _tradeCount = 0;
	private _step = 0;

	getStep(): number {
		return this._step;
	}

	incrementStep(): void {
		this._step++;
	}

	getTotalFeesPaid(): Cash {
		return this._totalFeesPaid;
	}

	getTradeCount(): number {
		return this._tradeCount;
	}

	getHistory(): Readonly<TradeRecord[]> {
		return this._history;
	}

	record(trade: Omit<TradeRecord, "step">): void {
		this._totalFeesPaid = Cash.of(+this._totalFeesPaid + +trade.fee);
		this._tradeCount++;
		this._history.push({
			step: this._step,
			...trade,
		});
	}

	reset(): void {
		this._history.length = 0;
		this._totalFeesPaid = Cash.zero();
		this._tradeCount = 0;
		this._step = 0;
	}
}
