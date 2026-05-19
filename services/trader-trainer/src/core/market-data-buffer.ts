import {
  CandleEntity,
  TradeEntity,
  OrderBookEntity,
  BookTickerEntity,
  TickerEntity,
} from '@trading-model/common/config/event.types';
import { MarketStep } from './genetic-algorithm/genome-types';

export class RunningNormalizer {
  private mean = 0;
  private m2 = 0;
  private count = 0;

  update(value: number): void {
    this.count++;
    const delta = value - this.mean;
    this.mean += delta / this.count;
    const delta2 = value - this.mean;
    this.m2 += delta * delta2;
  }

  getMean(): number {
    return this.mean;
  }

  getStd(): number {
    if (this.count < 2) return 0;
    return Math.sqrt(this.m2 / (this.count - 1));
  }

  normalize(value: number): number {
    const std = this.getStd();
    if (std < 1e-10) return 0;
    return (value - this.mean) / std;
  }
}

export const FEATURE_DIM = 32;

export type SymbolState = {
  candles: CandleEntity[];
  trades: TradeEntity[];
  orderBook: OrderBookEntity | null;
  bookTicker: BookTickerEntity | null;
  ticker24h: TickerEntity | null;

  closeNorm: RunningNormalizer;
  volumeNorm: RunningNormalizer;
  openNorm: RunningNormalizer;
  highNorm: RunningNormalizer;
  lowNorm: RunningNormalizer;
  tradePriceNorm: RunningNormalizer;
  tradeQtyNorm: RunningNormalizer;
  bidNorm: RunningNormalizer;
  askNorm: RunningNormalizer;
  spreadNorm: RunningNormalizer;
  tickerVolumeNorm: RunningNormalizer;
};

export class MarketDataBuffer {
  private states: Map<string, SymbolState> = new Map();
  private maxSize: number;
  private priceSnapshot: Record<string, number> = {};

  constructor(maxSize: number = 10000) {
    this.maxSize = maxSize;
  }

  private getOrCreate(symbol: string): SymbolState {
    let s = this.states.get(symbol);
    if (!s) {
      s = {
        candles: [],
        trades: [],
        orderBook: null,
        bookTicker: null,
        ticker24h: null,
        closeNorm: new RunningNormalizer(),
        volumeNorm: new RunningNormalizer(),
        openNorm: new RunningNormalizer(),
        highNorm: new RunningNormalizer(),
        lowNorm: new RunningNormalizer(),
        tradePriceNorm: new RunningNormalizer(),
        tradeQtyNorm: new RunningNormalizer(),
        bidNorm: new RunningNormalizer(),
        askNorm: new RunningNormalizer(),
        spreadNorm: new RunningNormalizer(),
        tickerVolumeNorm: new RunningNormalizer(),
      };
      this.states.set(symbol, s);
    }
    return s;
  }

  addCandles(symbol: string, candles: CandleEntity[]): void {
    const s = this.getOrCreate(symbol);
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
  }

  addTrades(symbol: string, trades: TradeEntity[]): void {
    const s = this.getOrCreate(symbol);
    for (const t of trades) {
      s.trades.push(t);
      s.tradePriceNorm.update(t.price);
      s.tradeQtyNorm.update(t.quantity);
    }
    if (s.trades.length > this.maxSize) {
      s.trades = s.trades.slice(-this.maxSize);
    }
  }

  setOrderBook(symbol: string, orderBook: OrderBookEntity): void {
    const s = this.getOrCreate(symbol);
    s.orderBook = orderBook;

    let bidSum = 0;
    for (const b of orderBook.bids) {
      bidSum += b.price;
    }
    const avgBid = orderBook.bids.size > 0 ? bidSum / orderBook.bids.size : 0;

    let askSum = 0;
    for (const a of orderBook.asks) {
      askSum += a.price;
    }
    const avgAsk = orderBook.asks.size > 0 ? askSum / orderBook.asks.size : 0;

    if (avgBid > 0) s.bidNorm.update(avgBid);
    if (avgAsk > 0) s.askNorm.update(avgAsk);
    if (avgAsk > 0 && avgBid > 0) {
      s.spreadNorm.update(avgAsk - avgBid);
    }
  }

  setBookTicker(symbol: string, bt: BookTickerEntity): void {
    const s = this.getOrCreate(symbol);
    s.bookTicker = bt;
    if (bt.bid > 0) s.bidNorm.update(bt.bid);
    if (bt.ask > 0) s.askNorm.update(bt.ask);
    if (bt.ask > 0 && bt.bid > 0) {
      s.spreadNorm.update(bt.ask - bt.bid);
    }
  }

  setTicker24h(symbol: string, ticker: TickerEntity): void {
    const s = this.getOrCreate(symbol);
    s.ticker24h = ticker;
    s.tickerVolumeNorm.update(ticker.volume);
  }

  setPriceSnapshot(prices: Record<string, number>): void {
    this.priceSnapshot = { ...this.priceSnapshot, ...prices };
  }

  getSymbols(): string[] {
    return Array.from(this.states.keys());
  }

  getCandleCount(symbol: string): number {
    return this.states.get(symbol)?.candles.length ?? 0;
  }

  buildMarketSteps(symbol: string): MarketStep[] {
    const s = this.states.get(symbol);
    if (!s || s.candles.length < 2) return [];

    const steps: MarketStep[] = [];
    for (let i = 1; i < s.candles.length; i++) {
      const features = this.buildFeatures(s, i);
      steps.push({
        price: s.candles[i].close,
        features,
        timestamp: s.candles[i].timestamp,
      });
    }
    return steps;
  }

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

  getAllWindows(
    symbol: string,
    validationSplit: number = 0.2
  ): { id: string; train: MarketStep[]; validation: MarketStep[] } | null {
    const steps = this.buildMarketSteps(symbol);
    if (steps.length < 10) return null;
    return this.splitTrainValidation(steps, validationSplit);
  }

  private buildFeatures(s: SymbolState, idx: number): Float32Array {
    const f = new Float32Array(FEATURE_DIM);
    const cur = s.candles[idx];
    const prev = s.candles[idx - 1];

    // ---- Candle-derived (0-8) ----
    f[0] = s.closeNorm.normalize(cur.close);
    f[1] = s.volumeNorm.normalize(cur.volume);
    f[2] = prev.close > 0 ? (cur.close - prev.close) / prev.close : 0;
    f[3] = cur.high - cur.low > 0 ? (cur.close - cur.open) / (cur.high - cur.low) : 0;
    f[4] = cur.close > 0 ? (cur.high - cur.low) / cur.close : 0;
    f[5] = s.openNorm.normalize(cur.open);
    f[6] = s.highNorm.normalize(cur.high);
    f[7] = s.lowNorm.normalize(cur.low);

    const volStd = s.volumeNorm.getStd();
    f[8] = volStd > 1e-10 ? cur.volume / volStd : 0;

    // ---- Order book (9-12) ----
    const obAvg = this.orderBookAverages(s);
    if (obAvg) {
      f[9] = s.bidNorm.normalize(obAvg.avgBid);
      f[10] = s.askNorm.normalize(obAvg.avgAsk);
      f[11] =
        obAvg.avgAsk > 0 && obAvg.avgBid > 0 ? (obAvg.avgAsk - obAvg.avgBid) / obAvg.avgAsk : 0;
      const totalQty = obAvg.bidQty + obAvg.askQty;
      f[12] = totalQty > 0 ? (obAvg.bidQty - obAvg.askQty) / totalQty : 0;
    }

    // ---- Book ticker (13-15) ----
    if (s.bookTicker) {
      const bt = s.bookTicker;
      f[13] = s.bidNorm.normalize(bt.bid);
      f[14] = s.askNorm.normalize(bt.ask);
      const spread = bt.ask - bt.bid;
      f[15] = bt.ask > 0 ? spread / bt.ask : 0;
    }

    // ---- Recent trades (16-18) ----
    const recentTrades = s.trades.filter(t => t.timestamp >= cur.timestamp - 60000);
    if (recentTrades.length > 0) {
      const avgPrice = recentTrades.reduce((a, t) => a + t.price, 0) / recentTrades.length;
      const totalQty = recentTrades.reduce((a, t) => a + t.quantity, 0);
      const buyQty = recentTrades.filter(t => t.side === 'buy').reduce((a, t) => a + t.quantity, 0);
      f[16] = s.tradePriceNorm.normalize(avgPrice);
      f[17] = s.tradeQtyNorm.normalize(totalQty);
      f[18] = totalQty > 0 ? buyQty / totalQty : 0.5;
    }

    // ---- 24h ticker (19-21) ----
    if (s.ticker24h) {
      const tk = s.ticker24h;
      f[19] = tk.open > 0 ? (tk.last - tk.open) / tk.open : 0;
      f[20] = s.tickerVolumeNorm.normalize(tk.volume);
      f[21] = tk.open > 0 ? (tk.high - tk.low) / tk.open : 0;
    }

    // ---- Price ticker snapshot (22) ----
    const snapPrice = this.priceSnapshot[s.candles[idx].symbol] ?? cur.close;
    f[22] = s.closeNorm.normalize(snapPrice);

    // ---- Sliding window: last 8 closes (23-30) ----
    const lookbackStart = Math.max(0, idx - 8);
    let fi = 23;
    for (let j = lookbackStart; j < idx && fi < 31; j++) {
      f[fi++] = s.closeNorm.normalize(s.candles[j].close);
    }
    while (fi < 31) {
      f[fi++] = 0;
    }

    // ---- Bias (31) ----
    f[31] = 1.0;

    return f;
  }

  private orderBookAverages(s: SymbolState): {
    avgBid: number;
    avgAsk: number;
    bidQty: number;
    askQty: number;
  } | null {
    if (s.orderBook) {
      const ob = s.orderBook;
      let bidSum = 0;
      let bidQty = 0;
      for (const b of ob.bids) {
        bidSum += b.price;
        bidQty += b.quantity;
      }
      let askSum = 0;
      let askQty = 0;
      for (const a of ob.asks) {
        askSum += a.price;
        askQty += a.quantity;
      }
      return {
        avgBid: ob.bids.size > 0 ? bidSum / ob.bids.size : 0,
        avgAsk: ob.asks.size > 0 ? askSum / ob.asks.size : 0,
        bidQty,
        askQty,
      };
    }
    return null;
  }
}
