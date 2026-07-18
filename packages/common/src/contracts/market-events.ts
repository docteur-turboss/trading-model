import type { Price, TradingSymbol } from "../domain/primitives";
import type {
	BookTickerData,
	CandleData,
	OrderBookData,
	TickerData,
	TradeData,
} from "./market-data.types";

export enum MarketEvent {
	TestEvent = "example.debug.create",
	ExampleEvent = "example.show.create",
	FetchRecentTrades = "market.trade.recent.fetch",
	Fetch24hrTickerStats = "market.ticker.24hr-stats.fetch",
	FetchCandlestickSeries = "market.candlestick.series.fetch",
	FetchOrderBookSnapshot = "market.order-book.snapshot.fetch",
	FetchPriceTickerSnapshot = "market.price-ticker.snapshot.fetch",
	FetchOrderBookTickerSnapshot = "market.order-book-ticker.snapshot.fetch",
}

export interface MarketEventMap {
	[MarketEvent.TestEvent]: { debug: boolean };
	[MarketEvent.ExampleEvent]: undefined;
	[MarketEvent.FetchRecentTrades]: { trades: TradeData[] };
	[MarketEvent.Fetch24hrTickerStats]: { ticker: TickerData[] };
	[MarketEvent.FetchCandlestickSeries]: { candle: CandleData[] };
	[MarketEvent.FetchOrderBookSnapshot]: { orderBook: OrderBookData[] };
	[MarketEvent.FetchPriceTickerSnapshot]: {
		price: Record<TradingSymbol, Price>;
	};
	[MarketEvent.FetchOrderBookTickerSnapshot]: {
		bookTicker: BookTickerData[];
	};
}
