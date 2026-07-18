import type {
	MarketType,
	SourceType,
} from "@trading-model/common/config/event.types";
import type {
	TradingSymbol,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import { normalizeError } from "@trading-model/common/utils/errors";

import type { OrderBookData } from "../market-data.types";
import {
	OrderBookIndexQuerier,
	type OrderBookIndexSnapshot,
} from "./order-book-index-querier";

interface MarketOrderBooksSnapshot {
	storage: Map<number, OrderBookData>;
	index: OrderBookIndexSnapshot;
	id: number;
}

const MARKER_ORDER_BOOKS = new (class MarketOrderBooksStore {
	private _storage: Map<number, OrderBookData> = new Map();
	private _indexQuerier = new OrderBookIndexQuerier();
	private _id = 10000;

	insertInto(data: OrderBookData[]) {
		if (!data.length) {
			return;
		}

		const snapshot = this._snapshotState();

		try {
			for (const entry of data) {
				this._indexQuerier.indexEntry(this._id, entry);
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
			index: this._indexQuerier.snapshot(),
			id: this._id,
		};
	}

	private _restoreState(snapshot: MarketOrderBooksSnapshot): void {
		this._id = snapshot.id;
		this._storage = snapshot.storage;
		this._indexQuerier.restore(snapshot.index);
	}

	getById(id: number) {
		if (!this._storage.has(id)) {
			return null;
		}
		return this._storage.get(id);
	}

	getBySymbol(symbol: TradingSymbol) {
		return this._indexQuerier.getBySymbol(symbol, this._storage);
	}

	getByMarket(market: MarketType) {
		return this._indexQuerier.getByMarket(market, this._storage);
	}

	getBySource(source: SourceType) {
		return this._indexQuerier.getBySource(source, this._storage);
	}

	getAfterTimestamp(timestamp: UnixTimestamp) {
		return this._indexQuerier.getAfterTimestamp(timestamp, this._storage);
	}

	getBeforeTimestamp(timestamp: UnixTimestamp) {
		return this._indexQuerier.getBeforeTimestamp(timestamp, this._storage);
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
	symbol: (symbol: TradingSymbol) => {
		return Promise.resolve(MARKER_ORDER_BOOKS.getBySymbol(symbol));
	},
	timestamp: {
		after: (timestamp: UnixTimestamp) => {
			return Promise.resolve(MARKER_ORDER_BOOKS.getAfterTimestamp(timestamp));
		},
		before: (timestamp: UnixTimestamp) => {
			return Promise.resolve(MARKER_ORDER_BOOKS.getBeforeTimestamp(timestamp));
		},
	},
	source: (source: SourceType) => {
		return Promise.resolve(MARKER_ORDER_BOOKS.getBySource(source));
	},
	id: (id: number) => {
		return Promise.resolve(MARKER_ORDER_BOOKS.getById(id));
	},
	market: (market: MarketType) => {
		return Promise.resolve(MARKER_ORDER_BOOKS.getByMarket(market));
	},
};
