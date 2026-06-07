import {
  CandleEntity,
  TradeEntity,
  OrderBookEntity,
  BookTickerEntity,
  TickerEntity,
} from '@trading-model/common/config/event.types';

import { NormalizationStats } from './normalization-stats';

export { NormalizationStats };

/** A branded string representing a trading pair symbol (e.g. "BTCUSDT"). */
export type TradingSymbol = string & { readonly __brand: unique symbol };

/** Convert a plain string to a TradingSymbol (runtime identity, compile-time type safety). */
export function toSymbol(s: string): TradingSymbol {
  return s as TradingSymbol;
}

/** Convert a TradingSymbol back to a plain string for external use. */
export function fromSymbol(s: TradingSymbol): string {
  return s;
}

/** Number of features produced by buildFeatures per market step. */
export const FEATURE_DIM = 32;

/** Per-symbol state: candles, trades, order book, ticker, and running normalisers. */
export type SymbolState = {
  candles: CandleEntity[];
  trades: TradeEntity[];
  orderBook: OrderBookEntity | null;
  bookTicker: BookTickerEntity | null;
  ticker24h: TickerEntity | null;

  closeNorm: NormalizationStats;
  volumeNorm: NormalizationStats;
  openNorm: NormalizationStats;
  highNorm: NormalizationStats;
  lowNorm: NormalizationStats;
  tradePriceNorm: NormalizationStats;
  tradeQtyNorm: NormalizationStats;
  bidNorm: NormalizationStats;
  askNorm: NormalizationStats;
  spreadNorm: NormalizationStats;
  tickerVolumeNorm: NormalizationStats;
};
