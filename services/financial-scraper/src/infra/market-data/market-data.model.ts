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

import { CandleData, OrderBookData, TickerData, TradeData } from './market-data.types';
import { insertCandles as IinsertCandles } from './schema/candles-schema';
import { insertOrderBook as IinsertOrderBook } from './schema/order-book.schema';
import { insertTicker as IinsertTicker } from './schema/ticker24h.schema';
import { insertTrades as IinsertTrades } from './schema/trades.schema';

/* ============================================================
 * MODEL
 * ========================================================== */
export const MarketDataModel = new (class {
  constructor() {}

  /** Insert candle records into the database. */
  async insertCandles(data: CandleData[]): Promise<void> {
    await IinsertCandles(data);
  }

  /** Insert trade records into the database. */
  async insertTrades(data: TradeData[]): Promise<void> {
    await IinsertTrades(data);
  }

  /** Insert an order-book snapshot into the database. */
  async insertOrderBook(data: OrderBookData): Promise<void> {
    await IinsertOrderBook([data]);
  }

  /** Insert 24-hour ticker records into the database. */
  async insertTicker(data: TickerData[]): Promise<void> {
    await IinsertTicker(data);
  }
})();
