import type {
	CandleData,
	OrderBookData,
	TickerData,
	TradeData,
} from "../market-data.types";

/** Market data persistence (implemented by the MySQL MarketDataModel). */
export interface MarketDataRepositoryPort {
	insertCandles(data: CandleData[]): Promise<void>;
	insertTrades(data: TradeData[]): Promise<void>;
	insertOrderBook(data: OrderBookData): Promise<void>;
	insertTicker(data: TickerData[]): Promise<void>;
}
