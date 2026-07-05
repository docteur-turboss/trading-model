/** Supported financial market categories. */
export const MarketType = {
	CRYPTO: "crypto",
	EQUITY: "equity",
	BOND: "bond",
	ETF: "etf",
	FX: "fx",
	FUTURE: "future",
} as const;

export type MarketType = (typeof MarketType)[keyof typeof MarketType];

/** Supported market data sources / exchanges. */
export const SourceType = {
	BLOOMBERG: "bloomberg",
	BINANCE: "binance",
	NYSE: "nyse",
} as const;

export type SourceType = (typeof SourceType)[keyof typeof SourceType];

/** Common fields shared by all market data entities. */
export interface BaseMarketData {
	symbol: string;
	source: SourceType;
	timestamp: number;
	market: MarketType;
}

/** Supported candlestick intervals. */
export const CandleInterval = {
	S1: "1s",
	MIN1: "1m",
	MIN3: "3m",
	MIN5: "5m",
	MIN15: "15m",
	MIN30: "30m",
	H1: "1h",
	H2: "2h",
	H4: "4h",
	H6: "6h",
	H8: "8h",
	H12: "12h",
	D1: "1d",
	D3: "3d",
	W1: "1w",
	MONTH1: "1M",
} as const;

export type CandleInterval = (typeof CandleInterval)[keyof typeof CandleInterval];

/** Represents a single OHLCV candlestick data point. */
export interface CandleData extends BaseMarketData {
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
	trades?: number;
	interval: CandleInterval;
	closeTimestamp: number;
}

/** Trade direction. */
export const TradeSide = {
	BUY: "buy",
	SELL: "sell",
} as const;

export type TradeSide = (typeof TradeSide)[keyof typeof TradeSide];

/** Represents an executed trade on a market. */
export interface TradeData extends BaseMarketData {
	price: number;
	tradeId: bigint;
	quantity: number;
	side: TradeSide;
}

/** Snapshot of the order book depth at a point in time. */
export interface OrderBookData extends BaseMarketData {
	bids: Set<{ price: number; quantity: number }>;
	asks: Set<{ price: number; quantity: number }>;
}

/** Best bid / ask ticker snapshot. */
export interface BookTickerData extends BaseMarketData {
	bidQty: number;
	askQty: number;
	bid: number;
	ask: number;
}

/** 24-hour price ticker statistics. */
export interface TickerData extends BaseMarketData {
	low: number;
	open: number;
	high: number;
	last: number;
	volume: number;
	closeTimestamp: number;
}

/** Compute a price-weighted average bid from an order book. */
export function getAvgBid(orderBook: OrderBookData): number {
	let totalQty = 0;
	let totalValue = 0;
	for (const { price, quantity } of orderBook.bids) {
		totalValue += +price * +quantity;
		totalQty += +quantity;
	}
	return totalQty > 0 ? totalValue / totalQty : 0;
}

/** Compute a price-weighted average ask from an order book. */
export function getAvgAsk(orderBook: OrderBookData): number {
	let totalQty = 0;
	let totalValue = 0;
	for (const { price, quantity } of orderBook.asks) {
		totalValue += +price * +quantity;
		totalQty += +quantity;
	}
	return totalQty > 0 ? totalValue / totalQty : 0;
}

/** Total quantity available on the bid side of an order book. */
export function getBidTotalQty(orderBook: OrderBookData): number {
	let total = 0;
	for (const { quantity } of orderBook.bids) {
		total += +quantity;
	}
	return total;
}

/** Total quantity available on the ask side of an order book. */
export function getAskTotalQty(orderBook: OrderBookData): number {
	let total = 0;
	for (const { quantity } of orderBook.asks) {
		total += +quantity;
	}
	return total;
}

/** Named references for all known event message keys. */
export const EnumEventMessage = {
	testEvent: "example.debug.create",
	exampleEvent: "example.show.create",
	fetchRecentTrades: "market.trade.recent.fetch",
	fetch24hrTickerStats: "market.ticker.24hr-stats.fetch",
	fetchCandlestickSeries: "market.candlestick.series.fetch",
	fetchOrderBookSnapshot: "market.order-book.snapshot.fetch",
	fetchPriceTickerSnapshot: "market.price-ticker.snapshot.fetch",
	fetchOrderBookTickerSnapshot: "market.order-book-ticker.snapshot.fetch",

	/** Audit system events */
	auditHeartbeat: "audit.heartbeat",
	auditGapDetected: "audit.gap.detected",

	/** CA / Certificate Infrastructure events */
	certificateRevoked: "certificate.revoked",
	caKeyRotated: "ca.key.rotated",
} as const;

type EventMessage = (typeof EnumEventMessage)[keyof typeof EnumEventMessage];

/** Maps event names to their associated payload types. */
export interface EventMap {
	[EnumEventMessage.testEvent]: { debug: boolean };
	[EnumEventMessage.exampleEvent]: undefined;
	[EnumEventMessage.fetchRecentTrades]: { trades: TradeData[] };
	[EnumEventMessage.fetch24hrTickerStats]: { ticker: TickerData[] };
	[EnumEventMessage.fetchCandlestickSeries]: { candle: CandleData[] };
	[EnumEventMessage.fetchOrderBookSnapshot]: { orderBook: OrderBookData[] };
	[EnumEventMessage.fetchPriceTickerSnapshot]: {
		price: Record<string, number>;
	};
	[EnumEventMessage.fetchOrderBookTickerSnapshot]: {
		bookTicker: BookTickerData[];
	};

	/** Audit system events */
	[EnumEventMessage.auditHeartbeat]: {
		serviceName: string;
		instanceId: string;
	};
	[EnumEventMessage.auditGapDetected]: {
		from: Date;
		to: Date;
		lostCount?: number;
	};

	/** CA / Certificate Infrastructure events */
	[EnumEventMessage.certificateRevoked]: {
		serialNumber: string;
		serviceId: string;
		reason: string;
		revokedAt: string;
		instanceId: string;
	};
	[EnumEventMessage.caKeyRotated]: {
		keyId: string;
		keyVersion: number;
		instanceId: string;
	};
}

/** Extracts the payload type for a given event message. */
export type EventMessagesArgs<TValue extends EventMessage> = EventMap[TValue];
/** Union of all valid event message string values. */
export type EventEnumMap =
	(typeof EnumEventMessage)[keyof typeof EnumEventMessage];
