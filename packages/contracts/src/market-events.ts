import type {
	Price,
	TradingSymbol,
} from "@trading-model/primitives/primitives";
import type {
	BookTickerData,
	CandleData,
	OrderBookData,
	TickerData,
	TradeData,
} from "./market-data.types";

export enum MarketEvent {
	FetchRecentTrades = "market.trade.recent.fetch",
	Fetch24hrTickerStats = "market.ticker.24hr-stats.fetch",
	FetchCandlestickSeries = "market.candlestick.series.fetch",
	FetchOrderBookSnapshot = "market.order-book.snapshot.fetch",
	FetchPriceTickerSnapshot = "market.price-ticker.snapshot.fetch",
	FetchOrderBookTickerSnapshot = "market.order-book-ticker.snapshot.fetch",
}

export interface MarketEventMap {
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
