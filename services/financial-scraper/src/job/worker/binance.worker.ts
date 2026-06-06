/**
 * BinanceWorker
 * -------------
 * Orchestration-oriented worker intended to be executed via node-cron.
 *
 * Responsibilities:
 *  - Orchestrating Binance API calls
 *  - Data normalization
 *  - Returning a unified payload ready for persistence
 *
 * The worker is deliberately stateless to simplify usage
 * in distributed environments.
 */

import { createHash } from 'node:crypto';

import { helper } from '@trading-model/broker-message';
import { DeliveryMode } from '@trading-model/common/config/delivery-mode.types';
import { EnumEventMessage } from '@trading-model/common/config/event.types';
import { ServiceInstanceName } from '@trading-model/common/config/services.types';
import { deterministicStringify } from '@trading-model/common/utils/deterministic-stringify';

import {
  getOrderBook,
  CandlestickData,
  getRecentTrades,
  getOrderBookTicker,
  get24hrTickerStats,
  getSymbolPriceTicker,
} from '../../clients/binance/binance.client';
import { BinanceNormalizer } from '../../clients/binance/normalizer';
import { env } from '../../config/env';
import { MessageManager } from '../../config/message-manager';

/** Configuration options for a single BinanceWorker execution against one symbol. */
export interface BinanceWorkerOptions {
  symbol: string;
  interval?: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
  candleLimit?: number;
  tradeLimit?: number;
  orderBookLimit?: number;
}

/** Normalized market data returned by a BinanceWorker execution, ready for persistence. */
export interface BinanceWorkerResult {
  orderBook?: ReturnType<typeof BinanceNormalizer.orderBook>;
  recentTrades?: ReturnType<typeof BinanceNormalizer.trades>;
  candles?: ReturnType<typeof BinanceNormalizer.candles>;
  ticker24h?: ReturnType<typeof BinanceNormalizer.ticker24h>;
  priceTicker?: ReturnType<typeof BinanceNormalizer.priceTicker>;
  bookTicker?: ReturnType<typeof BinanceNormalizer.bookTicker>;
  fetchedAt: number;
}

export class BinanceWorker {
  constructor(private readonly options: BinanceWorkerOptions) {}

  /**
   * Main worker execution.
   * Can be directly invoked from node-cron.
   *
   */
  public async run(): Promise<BinanceWorkerResult> {
    const { v4 } = await import('uuid');
    const uuid = v4;
    const builderMetadata = new helper.MetadataBuilder();

    const {
      symbol,
      interval = '1m',
      candleLimit = 100,
      tradeLimit = 100,
      orderBookLimit = 100,
    } = this.options;

    const [orderBookRaw, tradesRaw, candlesRaw, ticker24hRaw, priceTickerRaw, bookTickerRaw] =
      await Promise.all([
        getOrderBook(symbol, orderBookLimit),
        getRecentTrades(symbol, tradeLimit),
        CandlestickData(symbol, candleLimit, interval),
        get24hrTickerStats([symbol]),
        getSymbolPriceTicker([symbol]),
        getOrderBookTicker([symbol]),
      ]);

    const response = {
      orderBook: BinanceNormalizer.orderBook(symbol, orderBookRaw),
      recentTrades: BinanceNormalizer.trades(symbol, tradesRaw),
      candles: BinanceNormalizer.candles(symbol, interval, candlesRaw),
      ticker24h: BinanceNormalizer.ticker24h(ticker24hRaw),
      priceTicker: BinanceNormalizer.priceTicker(priceTickerRaw),
      bookTicker: BinanceNormalizer.bookTicker(bookTickerRaw),
      fetchedAt: Date.now(),
    };

    const authContext = {
      roles: ['Data', 'Financial', 'Scrapper'],
      subject: env.SERVICE_NAME,
      tenantId: env.INSTANCE_ID,
    };

    const signature = createHash('sha256')
      .update(deterministicStringify(authContext))
      .digest('base64url');

    builderMetadata
      .setDelivery({
        mode: DeliveryMode.AT_LEAST_ONCE,
        deduplicationId: uuid(),
      })
      .setEventType('FetchCandlestick')
      .setTopic(EnumEventMessage.fetchCandlestickSeries)
      .setSecurity({
        authContext,
        signature,
      })
      .setIds({
        causationId: uuid(),
        correlationId: uuid(),
      })
      .setPublisher({
        instanceId: env.INSTANCE_ID,
        serviceName: env.SERVICE_NAME as ServiceInstanceName,
      });

    MessageManager.post.indirect(response.candles, builderMetadata.toJSON());

    builderMetadata
      .setTopic(EnumEventMessage.fetchOrderBookSnapshot)
      .setEventType('FetchOrderbook');

    MessageManager.post.indirect(response.orderBook, builderMetadata.toJSON());

    builderMetadata.setTopic(EnumEventMessage.fetch24hrTickerStats).setEventType('FetchTicker24hr');

    MessageManager.post.indirect(response.ticker24h, builderMetadata.toJSON());

    builderMetadata
      .setTopic(EnumEventMessage.fetchOrderBookTickerSnapshot)
      .setEventType('FetchBookTicker');

    MessageManager.post.indirect(response.bookTicker, builderMetadata.toJSON());

    builderMetadata
      .setTopic(EnumEventMessage.fetchPriceTickerSnapshot)
      .setEventType('FetchPriceTicker');

    MessageManager.post.indirect(response.priceTicker, builderMetadata.toJSON());

    builderMetadata.setTopic(EnumEventMessage.fetchRecentTrades).setEventType('FetchRecentTrades');

    MessageManager.post.indirect(response.recentTrades, builderMetadata.toJSON());

    return response;
  }
}
