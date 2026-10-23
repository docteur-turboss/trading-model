import type { DeliveryMode } from "@trading-model/contracts/delivery-mode";
import type { CandleInterval } from "@trading-model/contracts/market-data.types";
import type {
	Limit,
	Price,
	TradingSymbol,
	Volume,
} from "@trading-model/primitives/primitives";
import type {
	CandleData,
	OrderBookData,
	TickerData,
	TradeData,
} from "./market-data.types";

export interface BinanceWorkerOptions {
	symbol: TradingSymbol;
	interval?: CandleInterval;
	candleLimit?: Limit;
	tradeLimit?: Limit;
	orderBookLimit?: Limit;
	deliveryMode?: DeliveryMode;
}

export interface BookTickerQuote {
	symbol: TradingSymbol;
	bid: Price;
	ask: Price;
	bidQty: Volume;
	askQty: Volume;
}

/** Normalized market data fetched for one symbol during a scrape cycle. */
export interface BinanceWorkerResult {
	orderBook?: OrderBookData;
	recentTrades?: TradeData[];
	candles?: CandleData[];
	ticker24h?: TickerData[];
	priceTicker?: Record<TradingSymbol, Price>;
	bookTicker?: BookTickerQuote[];
	fetchedAt: number;
}
