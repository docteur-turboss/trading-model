import {
  CandleData,
  TradeData,
  OrderBookData,
  BookTickerData,
  TickerData,
  getAvgBid,
  getAvgAsk,
} from '@trading-model/common/config/event.types';

import { buildFeatures as buildFeaturesFn } from './feature-builder';
import { MarketStep } from './genetic-algorithm/genome-types';
import {
  NormalizationStats,
  SymbolState,
  TradingSymbol,
  toSymbol,
  fromSymbol,
} from './market-data-types';

/** Minimum number of market steps required before training can start. */
export const MIN_TRAINING_STEPS = 10;

/** Default fraction of data held out for validation during training. */
export const DEFAULT_VALIDATION_SPLIT = 0.2;

export interface MarketDataBufferConfig {
  maxSize?: number;
  maxMemoryMb?: number;
  evictionPolicy?: 'LRU' | 'none';
}

/** In-memory ring buffer of market data per symbol with online feature extraction. */
export class MarketDataBuffer {
  private states: Map<TradingSymbol, SymbolState> = new Map();
  private maxSize: number;
  private maxMemoryBytes: number;
  private evictionPolicy: 'LRU' | 'none';
  private accessOrder: TradingSymbol[] = [];
  private priceSnapshot: Record<TradingSymbol, number> = {} as Record<TradingSymbol, number>;

  constructor(config: MarketDataBufferConfig = {}) {
    this.maxSize = config.maxSize ?? 10000;
    this.maxMemoryBytes = (config.maxMemoryMb ?? 512) * 1024 * 1024;
    this.evictionPolicy = config.evictionPolicy ?? 'none';
  }

  getMaxSize(): number {
    return this.maxSize;
  }

  private getOrCreate(symbol: TradingSymbol): SymbolState {
    let s = this.states.get(symbol);
    if (!s) {
      s = {
        candles: [],
        trades: [],
        orderBook: null,
        bookTicker: null,
        ticker24h: null,
        closeNorm: new NormalizationStats(),
        volumeNorm: new NormalizationStats(),
        openNorm: new NormalizationStats(),
        highNorm: new NormalizationStats(),
        lowNorm: new NormalizationStats(),
        tradePriceNorm: new NormalizationStats(),
        tradeQtyNorm: new NormalizationStats(),
        bidNorm: new NormalizationStats(),
        askNorm: new NormalizationStats(),
        spreadNorm: new NormalizationStats(),
        tickerVolumeNorm: new NormalizationStats(),
      };
      this.states.set(symbol, s);
    }
    if (this.evictionPolicy === 'LRU') {
      const idx = this.accessOrder.indexOf(symbol);
      if (idx !== -1) this.accessOrder.splice(idx, 1);
      this.accessOrder.push(symbol);
    }
    return s;
  }

  private estimateMemoryBytes(s: SymbolState): number {
    const candleBytes = s.candles.length * 200;
    const tradeBytes = s.trades.length * 100;
    const orderBookBytes = s.orderBook ? 5000 : 0;
    return candleBytes + tradeBytes + orderBookBytes;
  }

  private enforceMemoryLimit(): void {
    if (this.evictionPolicy !== 'LRU') return;

    let total = 0;
    for (const state of this.states.values()) {
      total += this.estimateMemoryBytes(state);
    }

    while (total > this.maxMemoryBytes && this.accessOrder.length > 1) {
      const victim = this.accessOrder.shift();
      if (!victim) break;
      const state = this.states.get(victim);
      if (state) {
        total -= this.estimateMemoryBytes(state);
      }
      this.states.delete(victim);
    }
  }

  /** Append candlesticks and update running normalisers for price/volume features. */
  addCandles(symbol: string, candles: CandleData[]): void {
    const s = this.getOrCreate(toSymbol(symbol));
    for (const c of candles) {
      s.candles.push(c);
      s.closeNorm.update(c.close);
      s.volumeNorm.update(c.volume);
      s.openNorm.update(c.open);
      s.highNorm.update(c.high);
      s.lowNorm.update(c.low);
    }
    if (s.candles.length > this.maxSize) {
      s.candles = s.candles.slice(-this.maxSize);
    }
    this.enforceMemoryLimit();
  }

  /** Append recent trades and update price/quantity normalisers. */
  addTrades(symbol: string, trades: TradeData[]): void {
    const s = this.getOrCreate(toSymbol(symbol));
    for (const t of trades) {
      s.trades.push(t);
      s.tradePriceNorm.update(t.price);
      s.tradeQtyNorm.update(t.quantity);
    }
    if (s.trades.length > this.maxSize) {
      s.trades = s.trades.slice(-this.maxSize);
    }
    this.enforceMemoryLimit();
  }

  /** Store an order-book snapshot and update bid/ask/spread normalisers. */
  setOrderBook(symbol: string, orderBook: OrderBookData): void {
    const s = this.getOrCreate(toSymbol(symbol));
    s.orderBook = orderBook;

    const avgBid = getAvgBid(orderBook);
    const avgAsk = getAvgAsk(orderBook);

    if (avgBid > 0) s.bidNorm.update(avgBid);
    if (avgAsk > 0) s.askNorm.update(avgAsk);
    if (avgAsk > 0 && avgBid > 0) {
      s.spreadNorm.update(avgAsk - avgBid);
    }
    this.enforceMemoryLimit();
  }

  /** Store a book-ticker snapshot and update bid/ask/spread normalisers. */
  setBookTicker(symbol: string, bt: BookTickerData): void {
    const s = this.getOrCreate(toSymbol(symbol));
    s.bookTicker = bt;
    if (bt.bid > 0) s.bidNorm.update(bt.bid);
    if (bt.ask > 0) s.askNorm.update(bt.ask);
    if (bt.ask > 0 && bt.bid > 0) {
      s.spreadNorm.update(bt.ask - bt.bid);
    }
    this.enforceMemoryLimit();
  }

  /** Store a 24-hour ticker and update volume normaliser. */
  setTicker24h(symbol: string, ticker: TickerData): void {
    const s = this.getOrCreate(toSymbol(symbol));
    s.ticker24h = ticker;
    s.tickerVolumeNorm.update(ticker.volume);
    this.enforceMemoryLimit();
  }

  /** Merge a snapshot of latest prices into the internal price map. */
  setPriceSnapshot(prices: Record<string, number>): void {
    this.priceSnapshot = { ...this.priceSnapshot, ...prices } as Record<TradingSymbol, number>;
  }

  getSymbols(): string[] {
    return Array.from(this.states.keys()).map(fromSymbol);
  }

  getCandleCount(symbol: string): number {
    return this.states.get(toSymbol(symbol))?.candles.length ?? 0;
  }

  /** Builds a feature vector for each candle step (N candles → N-1 steps). */
  buildMarketSteps(symbol: string): MarketStep[] {
    const s = this.states.get(toSymbol(symbol));
    if (!s || s.candles.length < 2) return [];

    const steps: MarketStep[] = [];
    for (let i = 1; i < s.candles.length; i++) {
      const features = buildFeaturesFn(s, i, this.priceSnapshot);
      steps.push({
        price: s.candles[i].close,
        features,
        timestamp: s.candles[i].timestamp,
      });
    }
    return steps;
  }

  /** Splits market steps into train/validation sets by a given ratio. */
  splitTrainValidation(
    steps: MarketStep[],
    validationSplit: number
  ): { train: MarketStep[]; validation: MarketStep[]; id: string } {
    const splitIdx = Math.floor(steps.length * (1 - validationSplit));
    return {
      id: `window_${Date.now()}`,
      train: steps.slice(0, splitIdx),
      validation: steps.slice(splitIdx),
    };
  }

  /** Build a train/validation split from all available market steps, or null if insufficient data. */
  getAllWindows(
    symbol: string,
    validationSplit: number = DEFAULT_VALIDATION_SPLIT
  ): { id: string; train: MarketStep[]; validation: MarketStep[] } | null {
    const steps = this.buildMarketSteps(symbol);
    if (steps.length < MIN_TRAINING_STEPS) return null;
    return this.splitTrainValidation(steps, validationSplit);
  }
}
