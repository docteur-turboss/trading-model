/**
 * MarketDataModel
 * ---------------
 * Repository générique pour ingestion de données de marché.
 *
 * Compatible:
 *  - Crypto
 *  - Actions
 *  - Obligations
 *  - Futures
 *  - FX
 *
 * Conçu pour MySQL / MariaDB.
 */

import { insertTrades as IinsertTrades } from "./schema/trades.schema";
import { insertTicker as IinsertTicker } from "./schema/ticker24h.schema";
import { insertCandles as IinsertCandles } from "./schema/candles-schema";
import { insertOrderBook as IinsertOrderBook } from "./schema/orderBook.schema";
import { 
  CandleEntity, 
  OrderBookEntity, 
  TickerEntity, 
  TradeEntity 
} from "./market-data.types";

/* ============================================================
 * MODEL
 * ========================================================== */
export const MarketDataModel = new class {
  constructor() {}
  
  async insertCandles(data: CandleEntity[]): Promise<void> {
    await IinsertCandles(data);
  }

  async insertTrades(data: TradeEntity[]): Promise<void> {
    await IinsertTrades(data);
  }

  async insertOrderBook(data: OrderBookEntity): Promise<void> {
    await IinsertOrderBook([data]);
  }

  async insertTicker(data: TickerEntity[]): Promise<void> {
    await IinsertTicker(data);
  }
}()