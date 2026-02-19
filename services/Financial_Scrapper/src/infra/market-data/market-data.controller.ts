/**
 * MarketDataController
 * --------------------
 * Couche application recevant le payload du worker.
 *
 * - Valide
 * - Transforme en entités persistables
 * - Route vers le repository
 *
 * Agnostique du provider (Binance aujourd’hui, Bloomberg demain).
 */

import { MarketDataModel } from "./market-data.model";
import { BinanceWorkerResult } from "../../job/worker/binance.worker";

export const MarketDataController = new class {
  constructor() {}

  async persist(
    payload: BinanceWorkerResult,
  ): Promise<void> {

    const tasks: Promise<void>[] = [];

    /* ===========================
     * Candles
     * =========================== */
    if (payload.candles?.length) {
      tasks.push(
        MarketDataModel.insertCandles(payload.candles)
      );
    }

    /* ===========================
     * Trades
     * =========================== */
    if (payload.recentTrades?.length) {
      tasks.push(
        MarketDataModel.insertTrades(payload.recentTrades)
      );
    }

    /* ===========================
     * OrderBook
     * =========================== */
    if (payload.orderBook) {
      tasks.push(
        MarketDataModel.insertOrderBook(payload.orderBook)
      );
    }

    // payload.priceTicker
    // payload.bookTicker
    /* ===========================
     * Ticker
     * =========================== */
    if (payload.ticker24h?.length) {
      tasks.push(
        MarketDataModel.insertTicker(payload.ticker24h)
      );
    }

    await Promise.all(tasks);
  }
}()