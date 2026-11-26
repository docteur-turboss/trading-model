import type {
	CandleData,
	OrderBookData,
	TickerData,
} from "../market-data.types";

/** Market data persistence (implemented by the MySQL schema insert functions). */
export interface MarketDataRepositoryPort {
	insertCandles(data: CandleData[]): Promise<void>;
	insertOrderBook(data: OrderBookData): Promise<void>;
	insertTicker(data: TickerData[]): Promise<void>;
}
