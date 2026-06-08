/** Supported financial market categories. */
export const MarketType = {
  CRYPTO: 'crypto',
  EQUITY: 'equity',
  BOND: 'bond',
  ETF: 'etf',
  FX: 'fx',
  FUTURE: 'future',
} as const;

export type MarketType = (typeof MarketType)[keyof typeof MarketType];

/** Supported market data sources / exchanges. */
export const SourceType = {
  BLOOMBERG: 'bloomberg',
  BINANCE: 'binance',
  NYSE: 'nyse',
} as const;

export type SourceType = (typeof SourceType)[keyof typeof SourceType];

/** Common fields shared by all market data entities. */
export interface BaseMarketEntity {
  symbol: string;
  source: SourceType;
  timestamp: number;
  market: MarketType;
}

/** Represents a single OHLCV candlestick data point. */
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

/** Represents an executed trade on a market. */
export interface TradeEntity extends BaseMarketEntity {
  price: number;
  tradeId: bigint;
  quantity: number;
  side: 'buy' | 'sell';
}

/** Snapshot of the order book depth at a point in time. */
export interface OrderBookEntity extends BaseMarketEntity {
  bids: Set<{ price: number; quantity: number }>;
  asks: Set<{ price: number; quantity: number }>;
}

/** Best bid / ask ticker snapshot. */
export interface BookTickerEntity extends BaseMarketEntity {
  bidQty: number;
  askQty: number;
  bid: number;
  ask: number;
}

/** 24-hour price ticker statistics. */
export interface TickerEntity extends BaseMarketEntity {
  low: number;
  open: number;
  high: number;
  last: number;
  volume: number;
  closeTimestamp: number;
}

/** Named references for all known event message keys. */
export const EnumEventMessage = {
  testEvent: 'example.debug.create',
  exampleEvent: 'example.show.create',
  fetchRecentTrades: 'market.trade.recent.fetch',
  fetch24hrTickerStats: 'market.ticker.24hr-stats.fetch',
  fetchCandlestickSeries: 'market.candlestick.series.fetch',
  fetchOrderBookSnapshot: 'market.order-book.snapshot.fetch',
  fetchPriceTickerSnapshot: 'market.price-ticker.snapshot.fetch',
  fetchOrderBookTickerSnapshot: 'market.order-book-ticker.snapshot.fetch',
} as const;

type EventMessage = (typeof EnumEventMessage)[keyof typeof EnumEventMessage];

/** Maps event names to their associated payload types. */
export type EventMap = {
  [EnumEventMessage.testEvent]: { debug: boolean };
  [EnumEventMessage.exampleEvent]: void;
  [EnumEventMessage.fetchRecentTrades]: { trades: TradeEntity[] };
  [EnumEventMessage.fetch24hrTickerStats]: { ticker: TickerEntity[] };
  [EnumEventMessage.fetchCandlestickSeries]: { candle: CandleEntity[] };
  [EnumEventMessage.fetchOrderBookSnapshot]: { orderBook: OrderBookEntity[] };
  [EnumEventMessage.fetchPriceTickerSnapshot]: { price: Record<string, number> };
  [EnumEventMessage.fetchOrderBookTickerSnapshot]: { bookTicker: BookTickerEntity[] };
};

/** Extracts the payload type for a given event message. */
export type EventMessagesArgs<T extends EventMessage> = EventMap[T];
/** Union of all valid event message string values. */
export type EventEnumMap = (typeof EnumEventMessage)[keyof typeof EnumEventMessage];
