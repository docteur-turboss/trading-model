import {
	MarketType,
	type SourceType,
} from "@trading-model/contracts/market-data.types";
import type {
	Price,
	TradingSymbol,
	UnixTimestamp,
	Volume,
} from "@trading-model/primitives/primitives";
import zod from "zod";
import type { OrderBookData } from "../../../../domain/market-data.types";

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
	// Shape of the OrderBookData contract produced by the Binance normalizer.
	bids: zod.set(ASKS_BIDS_DEF),
	asks: zod.set(ASKS_BIDS_DEF),
	timestamp: zod.number(),
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
	/** Drop `id` from every index; a key left with no id is deleted, so queries on it return null again. */
	removeEntry(id: number, entry: OrderBookData): void {
		this._removeFromIndex(this._marketStorage, entry.market, id);
		this._removeFromIndex(this._sourceStorage, entry.source, id);
		this._removeFromIndex(this._symbolStorage, entry.symbol, id);
		this._removeFromIndex(this._timestampStorage, entry.timestamp, id);
	}
	/** Ids indexed for `symbol`, oldest first (ids grow with insertion). */
	idsForSymbol(symbol: TradingSymbol): readonly number[] {
		return this._symbolStorage.get(symbol) ?? [];
	}
	private _removeFromIndex<TKey>(
		storage: Map<TKey, number[]>,
		key: TKey,
		id: number
	): void {
		const ids = storage.get(key);
		if (!ids) {
			return;
		}
		const position = ids.indexOf(id);
		if (position !== -1) {
			ids.splice(position, 1);
		}
		if (!ids.length) {
			storage.delete(key);
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
