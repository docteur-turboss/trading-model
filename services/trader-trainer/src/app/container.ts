import {
  CandleData,
  TradeData,
  OrderBookData,
  BookTickerData,
  TickerData,
  EnumEventMessage,
  EventEnumMap,
} from '@trading-model/common/config/event.types';

import { MarketDataBuffer, MarketDataBufferConfig } from '../core/market-data-buffer';
import { Trainer } from '../core/trainer';

/** Minimum fraction of buffer capacity before training fires for a symbol. */
const MIN_CANDLE_RATIO = 0.1;

export interface AppContainerConfig {
  bufferSize: number;
  symbols: string[];
  validationSplit: number;
  generations: number;
  populationSize: number;
  timeBudgetMs: number;
  episodesPerIndividual: number;
  bufferMemoryLimitMb?: number;
}

export class ApplicationContainer {
  public readonly dataBuffer: MarketDataBuffer;
  public readonly trainer: Trainer;
  private trainingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: AppContainerConfig) {
    const bufferConfig: MarketDataBufferConfig = {
      maxSize: config.bufferSize,
      maxMemoryMb: config.bufferMemoryLimitMb ?? 512,
      evictionPolicy: 'LRU',
    };
    this.dataBuffer = new MarketDataBuffer(bufferConfig);
    this.trainer = new Trainer(this.dataBuffer);
  }

  onCandlestickSeries(data: { candle: CandleData[] }): void {
    if (!data?.candle || data.candle.length === 0) return;
    const symbol = data.candle[0].symbol;
    this.dataBuffer.addCandles(symbol, data.candle);
  }

  onRecentTrades(data: { trades: TradeData[] }): void {
    if (!data?.trades || data.trades.length === 0) return;
    const symbol = data.trades[0].symbol;
    this.dataBuffer.addTrades(symbol, data.trades);
  }

  onOrderBookSnapshot(data: { orderBook: OrderBookData[] }): void {
    if (!data?.orderBook || data.orderBook.length === 0) return;
    this.dataBuffer.setOrderBook(data.orderBook[0].symbol, data.orderBook[0]);
  }

  onOrderBookTickerSnapshot(data: { bookTicker: BookTickerData[] }): void {
    if (!data?.bookTicker || data.bookTicker.length === 0) return;
    for (const bt of data.bookTicker) {
      this.dataBuffer.setBookTicker(bt.symbol, bt);
    }
  }

  on24hrTickerStats(data: { ticker: TickerData[] }): void {
    if (!data?.ticker || data.ticker.length === 0) return;
    for (const tk of data.ticker) {
      this.dataBuffer.setTicker24h(tk.symbol, tk);
    }
  }

  onPriceTickerSnapshot(data: { price: Record<string, number> }): void {
    if (!data?.price) return;
    this.dataBuffer.setPriceSnapshot(data.price);
  }

  getSubscribedIntents(): EventEnumMap[] {
    return [
      EnumEventMessage.fetchCandlestickSeries,
      EnumEventMessage.fetchRecentTrades,
      EnumEventMessage.fetchOrderBookSnapshot,
      EnumEventMessage.fetchOrderBookTickerSnapshot,
      EnumEventMessage.fetch24hrTickerStats,
      EnumEventMessage.fetchPriceTickerSnapshot,
    ];
  }

  startTrainingLoop(symbols: string[], intervalMs: number): void {
    const runTraining = async (): Promise<void> => {
      if (this.trainer.isTraining()) return;

      for (const symbol of symbols) {
        if (
          this.dataBuffer.getCandleCount(symbol) >=
          this.dataBuffer.getMaxSize() * MIN_CANDLE_RATIO
        ) {
          await this.trainer.train(symbol);
          break;
        }
      }
    };

    runTraining();
    this.trainingInterval = setInterval(runTraining, intervalMs);
  }

  stopTrainingLoop(): void {
    if (this.trainingInterval) {
      clearInterval(this.trainingInterval);
      this.trainingInterval = null;
    }
  }
}
