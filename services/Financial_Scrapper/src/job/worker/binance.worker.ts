/**
 * BinanceWorker
 * -------------
 * Worker orienté orchestration destiné à être exécuté via node-cron.
 *
 * Responsabilités :
 *  - Orchestration des appels API Binance
 *  - Normalisation des données
 *  - Retour d’un payload unifié prêt à persistance
 *
 * Le worker est volontairement stateless pour faciliter son usage
 * dans des environnements distribués.
 */

import { helper } from "cash-lib/message-manager/index";
import { 
    getOrderBook, 
    CandlestickData, 
    getRecentTrades, 
    getOrderBookTicker, 
    get24hrTickerStats, 
    getSymbolPriceTicker } from "clients/binance/binance.client";
import { BinanceNormalizer } from "clients/binance/normalizer";
import { MessageManager } from "config/message-manager";

export interface BinanceWorkerOptions {
  symbol: string;
  interval?: "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
  candleLimit?: number;
  tradeLimit?: number;
  orderBookLimit?: number;
}

export interface BinanceWorkerResult {
  orderBook?: ReturnType<typeof BinanceNormalizer.orderBook>;
  recentTrades?: ReturnType<typeof BinanceNormalizer.trades>;
  candles?: ReturnType<typeof BinanceNormalizer.candles>;
  ticker24h?: ReturnType<typeof BinanceNormalizer.ticker24h>;
  priceTicker?: ReturnType<typeof BinanceNormalizer.priceTicker>;
  bookTicker?: ReturnType<typeof BinanceNormalizer.bookTicker>;
  fetchedAt: number;
}

const BuilderMetadata = new helper.MetadataBuilder();

export class BinanceWorker {
  constructor(private readonly options: BinanceWorkerOptions) {}

  /**
   * Exécution principale du worker.
   * Peut être directement appelé depuis node-cron.
   *
   * @example
   * cron.schedule("* * * * *", async () => {
   *   const worker = new BinanceWorker({ symbol: "BTCUSDT" });
   *   const data = await worker.run();
   *   await persistenceLayer.store(data);
   * });
   */
  public async run(): Promise<BinanceWorkerResult> {
    const {
      symbol,
      interval = "1m",
      candleLimit = 100,
      tradeLimit = 100,
      orderBookLimit = 100,
    } = this.options;

    const [
      orderBookRaw,
      tradesRaw,
      candlesRaw,
      ticker24hRaw,
      priceTickerRaw,
      bookTickerRaw,
    ] = await Promise.all([
      getOrderBook(symbol, orderBookLimit),
      getRecentTrades(symbol, tradeLimit),
      CandlestickData(symbol, candleLimit, interval),
      get24hrTickerStats([symbol]),
      getSymbolPriceTicker([symbol]),
      getOrderBookTicker([symbol]),
    ]);

    
    // MessageManager.post.indirect()

    return {
      orderBook: BinanceNormalizer.orderBook(symbol, orderBookRaw),
      recentTrades: BinanceNormalizer.trades(symbol, tradesRaw),
      candles: BinanceNormalizer.candles(
        symbol,
        interval,
        candlesRaw
      ),
      ticker24h: BinanceNormalizer.ticker24h(ticker24hRaw),
      priceTicker: BinanceNormalizer.priceTicker(priceTickerRaw),
      bookTicker: BinanceNormalizer.bookTicker(bookTickerRaw),
      fetchedAt: Date.now(),
    };
  }
}