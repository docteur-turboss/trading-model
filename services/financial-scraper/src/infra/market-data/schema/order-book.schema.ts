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
		const saveBeforeUpdate = {
			storage: this._storage,
			marketStorage: this._marketStorage,
			sourceStorage: this._sourceStorage,
			symbolStorage: this._symbolStorage,
			timestampStorage: this._timestampStorage,
			id: this._id,
		};

		const stringIndexStores: {
			storage: Map<string, number[]>;
			key: (entry: OrderBookData) => string;
		}[] = [
			{ storage: this._marketStorage, key: (entry) => entry.market },
			{ storage: this._sourceStorage, key: (entry) => entry.source },
			{ storage: this._symbolStorage, key: (entry) => entry.symbol },
		];

		try {
			for (const entry of data) {
				TABLE_DEF.parse(entry);

				this._storage.set(this._id, entry);
				for (const store of stringIndexStores) {
					const entryKey = store.key(entry);
					if (store.storage.has(entryKey)) {
						const entries = store.storage.get(entryKey)!;
						entries.push(this._id);
					} else {
						store.storage.set(entryKey, [this._id]);
					}
				}

				if (this._timestampStorage.has(entry.timestamp)) {
					const timestampEntries = this._timestampStorage.get(entry.timestamp)!;
					timestampEntries.push(this._id);
				} else {
					this._timestampStorage.set(entry.timestamp, [this._id]);
				}

				this._id++;
			}
		} catch (err) {
			this._id = saveBeforeUpdate.id;
			this._storage = saveBeforeUpdate.storage;
			this._marketStorage = saveBeforeUpdate.marketStorage;
			this._sourceStorage = saveBeforeUpdate.sourceStorage;
			this._symbolStorage = saveBeforeUpdate.symbolStorage;
			this._timestampStorage = saveBeforeUpdate.timestampStorage;

			throw normalizeError(err);
		}
		return this;
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
