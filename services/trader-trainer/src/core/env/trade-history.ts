export interface TradeRecord {
	step: number;
	action: "buy" | "sell";
	amount: number;
	price: number;
	fee: number;
	cashAfter: number;
	positionAfter: number;
}

export class TradeHistory {
	private readonly _history: TradeRecord[] = [];
	private _tradeCount = 0;
	private _totalFeesPaid = 0;

	record(record: TradeRecord): void {
		this._totalFeesPaid += record.fee;
		this._tradeCount++;
		this._history.push(record);
	}

	getHistory(): Readonly<TradeRecord[]> {
		return this._history;
	}

	getTradeCount(): number {
		return this._tradeCount;
	}

	getTotalFeesPaid(): number {
		return this._totalFeesPaid;
	}

	reset(): void {
		this._tradeCount = 0;
		this._totalFeesPaid = 0;
		this._history.length = 0;
	}
}
