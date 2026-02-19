/**
 * Type definition
 */

export type MarketType =
  | "crypto"
  | "equity"
  | "bond"
  | "etf"
  | "fx"
  | "future";

export const MarketType = {
  CRYPTO: "crypto",
  EQUITY: "equity",
  BOND: "bond",
  ETF: "etf",
  FX: "fx",
  FUTURE: "future"
} as const satisfies Record<string, MarketType>;

export type SourceType = 
 | "binance" 
 | "nyse"
 | "bloomberg"

export const SourceType = {
  BLOOMBERG: "bloomberg",
  BINANCE: "binance",
  NYSE: "nyse",
} as const satisfies Record<string, SourceType>;

export interface BaseMarketEntity {
  symbol: string;
  source: SourceType; // ex: binance, nyse, bloomberg
  timestamp: number;
  market: MarketType;
}

export interface CandleEntity extends BaseMarketEntity {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trades?: number;
  interval: string;
  closeTimestamp: number;
}

export interface TradeEntity extends BaseMarketEntity {
  price: number;
  tradeId: bigint;
  quantity: number;
  side: "buy" | "sell";
}

export interface OrderBookEntity extends BaseMarketEntity {
  bids: Set<{price: number, quantity: number}>;
  asks: Set<{price: number, quantity: number}>;
}

export interface BookTickerEntity extends BaseMarketEntity {
  bidQty: number;
  askQty: number;
  bid: number;
  ask: number;
}

export interface TickerEntity extends BaseMarketEntity {
  low: number;
  open: number;
  high: number;
  last: number;
  volume: number;
  closeTimestamp: number;
}

/**
 * Event definition
 */
export interface EventMap {
  "example.show.create": void;
  "example.debug.create": { debug: boolean };
  "market.trade.recent.fetch": { trades: TradeEntity[] };
  "market.ticker.24hr-stats.fetch": { ticker: TickerEntity[] };
  "market.candlestick.series.fetch": { candle: CandleEntity[] };
  "market.order-book.snapshot.fetch": { orderBook: OrderBookEntity[] };
  "market.price-ticker.snapshot.fetch": { price: Record<string, number> };
  "market.order-book-ticker.snapshot.fetch": { bookTicker: BookTickerEntity[] };
}

export const EnumEventMessage = {
  testEvent: "example.debug.create",
  exampleEvent: "example.show.create",
  fetchRecentTrades: "market.trade.recent.fetch",
  fetch24hrTickerStats: "market.ticker.24hr-stats.fetch",
  fetchCandlestickSeries: "market.candlestick.series.fetch",
  fetchOrderBookSnapshot: "market.order-book.snapshot.fetch",
  fetchPriceTickerSnapshot: "market.price-ticker.snapshot.fetch",
  fetchOrderBookTickerSnapshot: "market.order-book-ticker.snapshot.fetch",
} as const satisfies Record<string, keyof EventMap>;

type EventMessage = keyof EventMap;

export type EventMessagesArgs<T extends EventMessage> = EventMap[T];
export type EventEnumMap = typeof EnumEventMessage[keyof typeof EnumEventMessage];