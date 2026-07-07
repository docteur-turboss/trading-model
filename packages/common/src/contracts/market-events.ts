import type { Price, TradingSymbol } from "../domain/primitives";
import type {
	CandleData,
	OrderBookData,
	TickerData,
	TradeData,
	BookTickerData,
} from "./market-data.types";

/** Named references for market data event message keys. */
export enum MarketEvent {
	testEvent = "example.debug.create",
	exampleEvent = "example.show.create",
	fetchRecentTrades = "market.trade.recent.fetch",
	fetch24hrTickerStats = "market.ticker.24hr-stats.fetch",
	fetchCandlestickSeries = "market.candlestick.series.fetch",
	fetchOrderBookSnapshot = "market.order-book.snapshot.fetch",
	fetchPriceTickerSnapshot = "market.price-ticker.snapshot.fetch",
	fetchOrderBookTickerSnapshot = "market.order-book-ticker.snapshot.fetch",
}

/** Maps market event names to their associated payload types. */
export interface MarketEventMap {
	[MarketEvent.testEvent]: { debug: boolean };
	[MarketEvent.exampleEvent]: undefined;
	[MarketEvent.fetchRecentTrades]: { trades: TradeData[] };
	[MarketEvent.fetch24hrTickerStats]: { ticker: TickerData[] };
	[MarketEvent.fetchCandlestickSeries]: { candle: CandleData[] };
	[MarketEvent.fetchOrderBookSnapshot]: { orderBook: OrderBookData[] };
	[MarketEvent.fetchPriceTickerSnapshot]: {
		price: Record<TradingSymbol, Price>;
	};
	[MarketEvent.fetchOrderBookTickerSnapshot]: {
		bookTicker: BookTickerData[];
	};
}
