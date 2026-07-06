import { normalizeError } from "@trading-model/common/utils/errors";

import type { OrderBookData } from "../market-data.types";
import {
	OrderBookIndexManager,
	type OrderBookIndexSnapshot,
} from "./order-book-index-manager";

interface MarketOrderBooksSnapshot {
	storage: Map<number, OrderBookData>;
	index: OrderBookIndexSnapshot;
	id: number;
}

const MARKER_ORDER_BOOKS = new (class MarketOrderBooksStore {
	private _storage: Map<number, OrderBookData> = new Map();
	private _indexManager = new OrderBookIndexManager();
	private _id = 10000;

	insertInto(data: OrderBookData[]) {
		if (!data.length) {
			return;
		}

		const snapshot = this._snapshotState();

		try {
			for (const entry of data) {
				this._indexManager.indexEntry(this._id, entry);
				this._storage.set(this._id, entry);
				this._id++;
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
			index: this._indexManager.snapshot(),
			id: this._id,
		};
	}

	private _restoreState(snapshot: MarketOrderBooksSnapshot): void {
		this._id = snapshot.id;
		this._storage = snapshot.storage;
		this._indexManager.restore(snapshot.index);
	}

	getById(id: number) {
		if (!this._storage.has(id)) {
			return null;
		}
		return this._storage.get(id);
	}

	getBySymbol(symbol: string) {
		return this._indexManager.getBySymbol(symbol, this._storage);
	}

	getByMarket(market: string) {
		return this._indexManager.getByMarket(market, this._storage);
	}

	getBySource(source: string) {
		return this._indexManager.getBySource(source, this._storage);
	}

	getAfterTimestamp(timestamp: number) {
		return this._indexManager.getAfterTimestamp(timestamp, this._storage);
	}

	getBeforeTimestamp(timestamp: number) {
		return this._indexManager.getBeforeTimestamp(timestamp, this._storage);
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
