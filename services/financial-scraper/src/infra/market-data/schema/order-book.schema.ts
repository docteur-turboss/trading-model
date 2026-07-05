import { normalizeError } from "@trading-model/common/utils/errors";
import zod from "zod";

import type { OrderBookData } from "../market-data.types";

const ASKS_BIDS_DEF = zod.object({
	quantity: zod.number(),
	price: zod.number(),
});
const TABLE_DEF = zod.object({
	symbol: zod.string(),
	market: zod.enum(["crypto", "equity", "bond", "etf", "fx", "future"]),
	source: zod.string(),
	bids: zod.array(ASKS_BIDS_DEF),
	asks: zod.array(ASKS_BIDS_DEF),
	timestamp: zod.date(),
});

interface MarketOrderBooksSnapshot {
	storage: Map<number, OrderBookData>;
	marketStorage: Map<string, number[]>;
	sourceStorage: Map<string, number[]>;
	symbolStorage: Map<string, number[]>;
	timestampStorage: Map<number, number[]>;
	id: number;
}

const MARKER_ORDER_BOOKS = new (class MarketOrderBooksStore {
	private _storage: Map<number, OrderBookData> = new Map();
	private _marketStorage: Map<string, number[]> = new Map();
	private _sourceStorage: Map<string, number[]> = new Map();
	private _symbolStorage: Map<string, number[]> = new Map();
	private _timestampStorage: Map<number, number[]> = new Map();
	private _id = 10000;

	insertInto(data: OrderBookData[]) {
		if (!data.length) {
			return;
		}

		const snapshot = this._snapshotState();

		try {
			for (const entry of data) {
				this._indexEntry(entry);
			}
		} catch (err) {
			this._restoreState(snapshot);
			throw normalizeError(err);
		}
		return this;
	}

	private _snapshotState(): MarketOrderBooksSnapshot {
		return {
			storage: this._storage,
			marketStorage: this._marketStorage,
			sourceStorage: this._sourceStorage,
			symbolStorage: this._symbolStorage,
			timestampStorage: this._timestampStorage,
			id: this._id,
		};
	}

	private _restoreState(snapshot: MarketOrderBooksSnapshot): void {
		this._id = snapshot.id;
		this._storage = snapshot.storage;
		this._marketStorage = snapshot.marketStorage;
		this._sourceStorage = snapshot.sourceStorage;
		this._symbolStorage = snapshot.symbolStorage;
		this._timestampStorage = snapshot.timestampStorage;
	}

	private _indexEntry(entry: OrderBookData): void {
		TABLE_DEF.parse(entry);

		this._storage.set(this._id, entry);
		this._addToIndex(this._marketStorage, entry.market);
		this._addToIndex(this._sourceStorage, entry.source);
		this._addToIndex(this._symbolStorage, entry.symbol);

		if (this._timestampStorage.has(entry.timestamp)) {
			this._timestampStorage.get(entry.timestamp)!.push(this._id);
		} else {
			this._timestampStorage.set(entry.timestamp, [this._id]);
		}

		this._id++;
	}

	private _addToIndex(
		storage: Map<string, number[]>,
		key: string
	): void {
		if (storage.has(key)) {
			storage.get(key)!.push(this._id);
		} else {
			storage.set(key, [this._id]);
		}
	}

	getById(id: number) {
		if (!this._storage.has(id)) {
			return null;
		}
		return this._storage.get(id);
	}

	getBySymbol(symbol: string) {
		if (!this._symbolStorage.has(symbol)) {
			return null;
		}
		const symbols = this._symbolStorage.get(symbol)!;
		return symbols.map((entryId) => this._storage.get(entryId));
	}

	getByMarket(market: string) {
		if (!this._marketStorage.has(market)) {
			return null;
		}
		const markets = this._marketStorage.get(market)!;
		return markets.map((entryId) => this._storage.get(entryId));
	}

	getBySource(source: string) {
		if (!this._sourceStorage.has(source)) {
			return null;
		}
		const sources = this._sourceStorage.get(source)!;
		return sources.map((entryId) => this._storage.get(entryId));
	}

	getAfterTimestamp(timestamp: number) {
		const result = [];

		for (const [storedTs, entryIds] of this._timestampStorage.entries()) {
			if (storedTs > timestamp) {
				for (const entryId of entryIds) {
					result.push(this._storage.get(entryId)!);
				}
			}
		}

		return result.sort((left, right) => left.timestamp - right.timestamp);
	}

	getBeforeTimestamp(timestamp: number) {
		const result = [];

		for (const [storedTs, entryIds] of this._timestampStorage.entries()) {
			if (storedTs < timestamp) {
				for (const entryId of entryIds) {
					result.push(this._storage.get(entryId)!);
				}
			}
		}

		return result.sort((left, right) => left.timestamp - right.timestamp);
	}
})();

/** Persist order-book snapshots to in-memory storage. */
export const insertOrderBook = (data: OrderBookData[]): Promise<void> => {
	try {
		MARKER_ORDER_BOOKS.insertInto(data);
		return Promise.resolve();
	} catch (err) {
		return Promise.reject(err);
	}
};

/** Query helpers for in-memory order-book storage, indexed by symbol, source, market, id, and timestamp range. */
export const selectOrderBookBy = {
	symbol: (symbol: string) => {
		return Promise.resolve(MARKER_ORDER_BOOKS.getBySymbol(symbol));
	},
	timestamp: {
		after: (timestamp: number) => {
			return Promise.resolve(MARKER_ORDER_BOOKS.getAfterTimestamp(timestamp));
		},
		before: (timestamp: number) => {
			return Promise.resolve(MARKER_ORDER_BOOKS.getBeforeTimestamp(timestamp));
		},
	},
	source: (source: string) => {
		return Promise.resolve(MARKER_ORDER_BOOKS.getBySource(source));
	},
	id: (id: number) => {
		return Promise.resolve(MARKER_ORDER_BOOKS.getById(id));
	},
	market: (market: string) => {
		return Promise.resolve(MARKER_ORDER_BOOKS.getByMarket(market));
	},
};
