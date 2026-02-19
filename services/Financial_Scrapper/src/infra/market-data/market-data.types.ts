/**
 * PLEASE UPDATE THE /lib/common/config/event.types.ts if your mouving here
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