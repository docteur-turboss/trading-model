import { MarketType, type SourceType } from "@trading-model/common/contracts/market-data.types";
import type { TradingSymbol, UnixTimestamp } from "@trading-model/common/domain/primitives";
import zod from "zod";
import type { OrderBookData } from "../market-data.types";

const ASKS_BIDS_DEF = zod.object({ quantity: zod.number(), price: zod.number() });
const TABLE_DEF = zod.object({ symbol: zod.string(), market: zod.nativeEnum(MarketType), source: zod.string(), bids: zod.array(ASKS_BIDS_DEF), asks: zod.array(ASKS_BIDS_DEF), timestamp: zod.date() });

export interface OrderBookIndexSnapshot {
	marketStorage: Map<string, number[]>;
	sourceStorage: Map<string, number[]>;
	symbolStorage: Map<string, number[]>;
	timestampStorage: Map<number, number[]>;
}

export class OrderBookIndexQuerier {
	private _marketStorage: Map<string, number[]> = new Map();
	private _sourceStorage: Map<string, number[]> = new Map();
	private _symbolStorage: Map<string, number[]> = new Map();
	private _timestampStorage: Map<number, number[]> = new Map();

	snapshot(): OrderBookIndexSnapshot {
		return { marketStorage: this._marketStorage, sourceStorage: this._sourceStorage, symbolStorage: this._symbolStorage, timestampStorage: this._timestampStorage };
	}
	restore(snapshot: OrderBookIndexSnapshot): void {
		this._marketStorage = snapshot.marketStorage;
		this._sourceStorage = snapshot.sourceStorage;
		this._symbolStorage = snapshot.symbolStorage;
		this._timestampStorage = snapshot.timestampStorage;
	}
	indexEntry(id: number, entry: OrderBookData): void {
		TABLE_DEF.parse(entry);
		this._addToIndex(this._marketStorage, entry.market, id);
		this._addToIndex(this._sourceStorage, entry.source, id);
		this._addToIndex(this._symbolStorage, entry.symbol, id);
		if (this._timestampStorage.has(entry.timestamp)) {
			this._timestampStorage.get(entry.timestamp)!.push(id);
		} else { this._timestampStorage.set(entry.timestamp, [id]); }
	}
	private _addToIndex(storage: Map<string, number[]>, key: string, id: number): void {
		if (storage.has(key)) { storage.get(key)!.push(id); } else { storage.set(key, [id]); }
	}

	private _queryIndex<T>(storage: Map<string, number[]>, key: T, dataStorage: Map<number, OrderBookData>): (OrderBookData | undefined)[] | null {
		const ids = storage.get(String(key));
		return ids ? ids.map((entryId) => dataStorage.get(entryId)) : null;
	}

	getBySymbol(symbol: TradingSymbol, storage: Map<number, OrderBookData>): (OrderBookData | undefined)[] | null {
		return this._queryIndex(this._symbolStorage, symbol, storage);
	}
	getByMarket(market: MarketType, storage: Map<number, OrderBookData>): (OrderBookData | undefined)[] | null {
		return this._queryIndex(this._marketStorage, market, storage);
	}
	getBySource(source: SourceType, storage: Map<number, OrderBookData>): (OrderBookData | undefined)[] | null {
		return this._queryIndex(this._sourceStorage, source, storage);
	}
	getAfterTimestamp(timestamp: UnixTimestamp, storage: Map<number, OrderBookData>): OrderBookData[] {
		const result: OrderBookData[] = [];
		for (const [storedTs, entryIds] of this._timestampStorage) {
			if (storedTs > timestamp) { for (const entryId of entryIds) result.push(storage.get(entryId)!); }
		}
		return result.sort((a, b) => a.timestamp - b.timestamp);
	}
	getBeforeTimestamp(timestamp: UnixTimestamp, storage: Map<number, OrderBookData>): OrderBookData[] {
		const result: OrderBookData[] = [];
		for (const [storedTs, entryIds] of this._timestampStorage) {
			if (storedTs < timestamp) { for (const entryId of entryIds) result.push(storage.get(entryId)!); }
		}
		return result.sort((a, b) => a.timestamp - b.timestamp);
	}
}
