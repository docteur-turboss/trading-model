import type { MarketType, SourceType } from "@trading-model/common/config/event.types";
import type { TradingSymbol, UnixTimestamp } from "@trading-model/common/domain/primitives";
import type { OrderBookData } from "../market-data.types";
import {
	OrderBookIndexQuerier,
	type OrderBookIndexSnapshot,
} from "./order-book-index-querier";

export { type OrderBookIndexSnapshot } from "./order-book-index-querier";

export class OrderBookIndexManager {
	private readonly _querier = new OrderBookIndexQuerier();

	snapshot(): OrderBookIndexSnapshot {
		return this._querier.snapshot();
	}

	restore(snapshot: OrderBookIndexSnapshot): void {
		this._querier.restore(snapshot);
	}

	indexEntry(id: number, entry: OrderBookData): void {
		this._querier.indexEntry(id, entry);
	}

	getBySymbol(symbol: TradingSymbol, storage: Map<number, OrderBookData>) {
		return this._querier.getBySymbol(symbol, storage);
	}

	getByMarket(market: MarketType, storage: Map<number, OrderBookData>) {
		return this._querier.getByMarket(market, storage);
	}

	getBySource(source: SourceType, storage: Map<number, OrderBookData>) {
		return this._querier.getBySource(source, storage);
	}

	getAfterTimestamp(timestamp: UnixTimestamp, storage: Map<number, OrderBookData>) {
		return this._querier.getAfterTimestamp(timestamp, storage);
	}

	getBeforeTimestamp(timestamp: UnixTimestamp, storage: Map<number, OrderBookData>) {
		return this._querier.getBeforeTimestamp(timestamp, storage);
	}
}
