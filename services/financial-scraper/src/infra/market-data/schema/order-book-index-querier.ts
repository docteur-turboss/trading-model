import {
	MarketType,
	type SourceType,
} from "@trading-model/common/contracts/market-data.types";
import type {
	Price,
	TradingSymbol,
	UnixTimestamp,
	Volume,
} from "@trading-model/common/domain/primitives";
import zod from "zod";
import type { OrderBookData } from "../market-data.types";

const ASKS_BIDS_DEF = zod.object({
	quantity: zod.custom<Volume>(),
	price: zod.custom<Price>(),
});
const TABLE_DEF = zod.object({
	symbol: zod.string(),
	market: zod.enum([
		MarketType.Crypto,
		MarketType.Equity,
		MarketType.Bond,
		MarketType.Etf,
		MarketType.Fx,
		MarketType.Future,
	]),
	source: zod.string(),
	bids: zod.array(ASKS_BIDS_DEF),
	asks: zod.array(ASKS_BIDS_DEF),
	timestamp: zod.date(),
});

export interface OrderBookIndexSnapshot {
	marketStorage: Map<MarketType, number[]>;
	sourceStorage: Map<SourceType, number[]>;
	symbolStorage: Map<TradingSymbol, number[]>;
	timestampStorage: Map<UnixTimestamp, number[]>;
}

export class OrderBookIndexQuerier {
	private _marketStorage: Map<MarketType, number[]> = new Map();
	private _sourceStorage: Map<SourceType, number[]> = new Map();
	private _symbolStorage: Map<TradingSymbol, number[]> = new Map();
	private _timestampStorage: Map<UnixTimestamp, number[]> = new Map();

	snapshot(): OrderBookIndexSnapshot {
		return {
			marketStorage: this._marketStorage,
			sourceStorage: this._sourceStorage,
			symbolStorage: this._symbolStorage,
			timestampStorage: this._timestampStorage,
		};
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
		} else {
			this._timestampStorage.set(entry.timestamp, [id]);
		}
	}
	private _addToIndex<TKey extends string>(
		storage: Map<TKey, number[]>,
		key: TKey,
		id: number
	): void {
		if (storage.has(key)) {
			storage.get(key)!.push(id);
		} else {
			storage.set(key, [id]);
		}
	}

	private _queryIndex<TKey extends string>(
		storage: Map<TKey, number[]>,
		key: TKey,
		dataStorage: Map<number, OrderBookData>
	): (OrderBookData | undefined)[] | null {
		const ids = storage.get(key);
		return ids ? ids.map((entryId) => dataStorage.get(entryId)) : null;
	}

	getBySymbol(
		symbol: TradingSymbol,
		storage: Map<number, OrderBookData>
	): (OrderBookData | undefined)[] | null {
		return this._queryIndex(this._symbolStorage, symbol, storage);
	}
	getByMarket(
		market: MarketType,
		storage: Map<number, OrderBookData>
	): (OrderBookData | undefined)[] | null {
		return this._queryIndex(this._marketStorage, market, storage);
	}
	getBySource(
		source: SourceType,
		storage: Map<number, OrderBookData>
	): (OrderBookData | undefined)[] | null {
		return this._queryIndex(this._sourceStorage, source, storage);
	}
	getAfterTimestamp(
		timestamp: UnixTimestamp,
		storage: Map<number, OrderBookData>
	): OrderBookData[] {
		const result: OrderBookData[] = [];
		for (const [storedTs, entryIds] of this._timestampStorage) {
			if (storedTs > timestamp) {
				for (const entryId of entryIds) {
					result.push(storage.get(entryId)!);
				}
			}
		}
		return result.sort((itemA, itemB) => itemA.timestamp - itemB.timestamp);
	}
	getBeforeTimestamp(
		timestamp: UnixTimestamp,
		storage: Map<number, OrderBookData>
	): OrderBookData[] {
		const result: OrderBookData[] = [];
		for (const [storedTs, entryIds] of this._timestampStorage) {
			if (storedTs < timestamp) {
				for (const entryId of entryIds) {
					result.push(storage.get(entryId)!);
				}
			}
		}
		return result.sort((itemA, itemB) => itemA.timestamp - itemB.timestamp);
	}
}
