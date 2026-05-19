import { CandleEntity } from '@trading-model/common/config/event.types';
import { MarketStep } from './genetic-algorithm/genome-types';

export type NormalizedStats = {
  mean: number;
  std: number;
  count: number;
};

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

  normalize(value: number): number {
    if (this.count < 2) return 0;
    const std = Math.sqrt(this.m2 / (this.count - 1));
    if (std < 1e-10) return 0;
    return (value - this.mean) / std;
  }

  getStats(): NormalizedStats {
    return {
      mean: this.mean,
      std: this.count > 1 ? Math.sqrt(this.m2 / (this.count - 1)) : 0,
      count: this.count,
    };
  }
}

export const FEATURE_DIM = 16;

export type CandleBuffer = {
  symbol: string;
  candles: CandleEntity[];
  closeNormalizer: RunningNormalizer;
  volumeNormalizer: RunningNormalizer;
};

export class MarketDataBuffer {
  private buffers: Map<string, CandleBuffer> = new Map();
  private maxSize: number;

  constructor(maxSize: number = 10000) {
    this.maxSize = maxSize;
  }

  addCandles(symbol: string, candles: CandleEntity[]): void {
    let buffer = this.buffers.get(symbol);
    if (!buffer) {
      buffer = {
        symbol,
        candles: [],
        closeNormalizer: new RunningNormalizer(),
        volumeNormalizer: new RunningNormalizer(),
      };
      this.buffers.set(symbol, buffer);
    }

    for (const candle of candles) {
      buffer.candles.push(candle);
      buffer.closeNormalizer.update(candle.close);
      buffer.volumeNormalizer.update(candle.volume);
    }

    if (buffer.candles.length > this.maxSize) {
      buffer.candles = buffer.candles.slice(-this.maxSize);
    }
  }

  getSymbols(): string[] {
    return Array.from(this.buffers.keys());
  }

  getCandleCount(symbol: string): number {
    return this.buffers.get(symbol)?.candles.length ?? 0;
  }

  buildMarketSteps(symbol: string, lookback: number = FEATURE_DIM): MarketStep[] {
    const buffer = this.buffers.get(symbol);
    if (!buffer || buffer.candles.length < lookback + 1) return [];

    const steps: MarketStep[] = [];
    const candles = buffer.candles;

    for (let i = lookback; i < candles.length; i++) {
      const features = this.buildFeatures(candles, i, buffer);
      steps.push({
        price: candles[i].close,
        features,
        timestamp: candles[i].timestamp,
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

  private buildFeatures(
    candles: CandleEntity[],
    index: number,
    buffer: CandleBuffer
  ): Float32Array {
    const features = new Float32Array(FEATURE_DIM);
    const current = candles[index];
    const previous = candles[index - 1];
    const lookbackStart = Math.max(0, index - 10);

    const normClose = buffer.closeNormalizer.normalize(current.close);
    const normVolume = buffer.volumeNormalizer.normalize(current.volume);
    const priceChange = previous.close > 0 ? (current.close - previous.close) / previous.close : 0;
    const candleBody =
      current.high - current.low > 0
        ? (current.close - current.open) / (current.high - current.low)
        : 0;
    const volatility = current.close > 0 ? (current.high - current.low) / current.close : 0;

    features[0] = normClose;
    features[1] = normVolume;
    features[2] = priceChange;
    features[3] = candleBody;
    features[4] = volatility;

    let fi = 5;
    for (let j = lookbackStart; j < index && fi < 15; j++) {
      features[fi++] = buffer.closeNormalizer.normalize(candles[j].close);
    }
    while (fi < 15) {
      features[fi++] = 0;
    }

    features[15] = 1.0;

    return features;
  }
}
