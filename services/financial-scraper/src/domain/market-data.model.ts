/**
 * MarketDataModel
 * ----------------
 * Generic repository for market data ingestion.
 *
 * Compatible with:
 *  - Crypto
 *  - Stocks
 *  - Bonds
 *  - Futures
 *  - FX
 *
 * Designed for MySQL / MariaDB.
 */

import type {
	CandleData,
	OrderBookData,
	TickerData,
	TradeData,
} from "../infra/market-data/market-data.types";
import { insertCandles as IinsertCandles } from "../infra/market-data/schema/candles-schema";
import { insertOrderBook as IinsertOrderBook } from "../infra/market-data/schema/order-book.schema";
import { insertTicker as IinsertTicker } from "../infra/market-data/schema/ticker24h.schema";
import { insertTrades as IinsertTrades } from "../infra/market-data/schema/trades.schema";

export const MarketDataModel = new (class {
	async insertCandles(data: CandleData[]): Promise<void> {
		await IinsertCandles(data);
	}

	async insertTrades(data: TradeData[]): Promise<void> {
		await IinsertTrades(data);
	}

	async insertOrderBook(data: OrderBookData): Promise<void> {
		await IinsertOrderBook([data]);
	}

	async insertTicker(data: TickerData[]): Promise<void> {
		await IinsertTicker(data);
	}
})();
