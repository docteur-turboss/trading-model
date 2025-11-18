import {
  Binance24hrTickerStatsResponse,
  BinanceHistoricalTradeResponse,
  BinanceCandlestickDataResponse,
  BinanceAggregateTradeResponse,
  BinanceDepthResponse,
  BinanceTradeResponse,
  BinanceTradingDayTickerResponse,
  BinanceSymbolPriceTickerResponse,
  BinanceSymbolOrderBookTickerResponse,
} from "../../types/binance.api";
import { httpClients } from "../../config/http";
import { BINANCE_ENDPOINTS } from "./endpoints";
import { BINANCE_WEIGHTS } from "./weights";

const binance = httpClients.binance;

/**
 * Fetch order book
 * Weight varies by limit:
 *  - 1–100 → 5
 *  - 101–500 → 25
 *  - 501–1000 → 50
 *  - 1001–5000 → 250
 * @param symbol {string} - the symbol to fetch (e.g., BTCUSDT)
 * @param limit {number} - maximum 500 - 1000
 * @returns {Promise<BinanceDepthResponse>}
 */
export async function getOrderBook(
  symbol: string,
  limit = 100
): Promise<BinanceDepthResponse> {
  const weight = BINANCE_WEIGHTS.depth(limit);
  const response = await binance.get(BINANCE_ENDPOINTS.depth(limit, symbol), {
    weight,
  });
  return response.data;
}

/**
 * Fetch recent trades
 * Weight: 25
 * @param symbol {string} - the symbol to fetch (e.g., BTCUSDT)
 * @param limit {number} - maximum 500 - 1000
 * @returns {Promise<BinanceTradeResponse>}
 */
export async function getRecentTrades(
  symbol: string,
  limit = 500
): Promise<BinanceTradeResponse> {
  const weight = BINANCE_WEIGHTS.trades();
  const response = await binance.get(BINANCE_ENDPOINTS.trades(limit, symbol), {
    weight,
  });
  return response.data;
}

/**
 * Fetch historical trades
 * Weight: 25
 * @param symbol {string} - the symbol to fetch (e.g., BTCUSDT)
 * @param limit {number} - maximum 500 - 1000
 * @param fromId {string|number} - trade ID from which to start fetching
 * @returns {Promise<BinanceHistoricalTradeResponse>}
 */
export async function getHistoricalTrades(
  symbol: string,
  limit = 500,
  fromId: number | string
): Promise<BinanceHistoricalTradeResponse> {
  const weight = BINANCE_WEIGHTS.historicalTrades();
  const response = await binance.get(
    BINANCE_ENDPOINTS.historicalTrades(limit, symbol, fromId),
    { weight }
  );
  return response.data;
}

/**
 * Fetch candlestick data
 * Weight: 2.
 * @param symbol {string} - the symbol to fetch (e.g., BTCUSDT)
 * @param limit {number} - maximum 500 - 1000
 * @param interval {"1s"|"1m"|"3m"|"5m"|"15m"|"30m"|"1h"|"2h"|"4h"|"6h"|"8h"|"12h"|"1d"|"3d"|"1w"|"1M"} - candlestick interval
 * @param startTime {number} - timestamp in ms to start from (inclusive)
 * @returns {Promise<BinanceCandlestickDataResponse>}
 */
export async function ClandlestrickData(
  symbol: string,
  limit = 500,
  interval:
    | "1s"
    | "1m"
    | "3m"
    | "5m"
    | "15m"
    | "30m"
    | "1h"
    | "2h"
    | "4h"
    | "6h"
    | "8h"
    | "12h"
    | "1d"
    | "3d"
    | "1w"
    | "1M",
  startTime?: number
): Promise<BinanceCandlestickDataResponse> {
  const weight = BINANCE_WEIGHTS.candlesticks();
  const response = await binance.get(
    BINANCE_ENDPOINTS.candlesticks(symbol, interval, startTime, limit),
    { weight }
  );
  return response.data;
}


/**
 * Fetch compressed aggregate trades 
 * Weight : 4.
 * @param symbol {string} - the symbol to fetch (e.g., BTCUSDT)
 * @param limit {number} - maximum 500 - 1000
 * @param fromId {string|number} - trade ID from which to start fetching
 * @param startTime {number} - timestamp in ms to start from (inclusive)
 * @returns {Promise<BinanceAggregateTradeResponse>}
 */
export async function getCompressedAggregateTrades(
  symbol: string,
  fromId: string | number,
  limit = 500
): Promise<BinanceAggregateTradeResponse> {
  const weight = BINANCE_WEIGHTS.compressedAggregateTrades();
  const response = await binance.get(
    BINANCE_ENDPOINTS.compressedAggregateTrades(
      symbol,
      fromId,
      limit
    ),
    { weight }
  );
  return response.data;
}

/**
 * Fetch 24hr ticker stats
 * Weight varies by number of symbols:
 *  - up to 20 symbols → 2
 *  - 21–100 symbols → 40
 *  - more than 100 symbols → 80
 * @param symbol {string[]} - the symbols to fetch (e.g., ["BTCUSDT"])
 * @returns 
 */
export async function get24hrTickerStats(
  symbol?: string[]
): Promise<Binance24hrTickerStatsResponse> {
  const weight = BINANCE_WEIGHTS.change24hrStats((symbol??[]).length);
  const response = await binance.get(
    BINANCE_ENDPOINTS.change24hrStats(symbol),
    { weight }
  );
  return response.data;
}

/**
 * Fetch 24hr ticker stats
 * Weight varies by number of symbols:
 *  - up to 50 symbols → 4 * number of symbols
 *  - less than 100 symbols → 200
 * @param symbol {string[]} - the symbols to fetch (e.g., ["BTCUSDT"])
 * @returns 
 */
export async function getTradingDayTicker(
  symbol: string[]
): Promise<BinanceTradingDayTickerResponse> {
  const weight = BINANCE_WEIGHTS.tradingDayTicker(symbol.length);
  const response = await binance.get(
    BINANCE_ENDPOINTS.TradingDayTicker(symbol),
    { weight }
  );
  return response.data;
}

/**
 * Fetch symbol price ticker
 * Weight: 4.
 * @param symbol {string[]} - the symbols to fetch (e.g., ["BTCUSDT"])
 * @returns {Promise<BinanceSymbolPriceTickerResponse>}
 */
export async function getSymbolPriceTicker(
  symbol?: string[]
): Promise<BinanceSymbolPriceTickerResponse> {
  const weight = BINANCE_WEIGHTS.symbolPriceTicker((symbol??[]).length);
  const response = await binance.get(
    BINANCE_ENDPOINTS.symbolPriceTicker(symbol),
    { weight }
  );
  return response.data;
}

/**
 * Fetch order book ticker
 * Weight: 4.
 * @param symbol {string[]} - the symbols to fetch (e.g., ["BTCUSDT"])
 * @returns {Promise<BinanceSymbolPriceTickerResponse>}
 */
export async function getOrderBookTicker(
  symbol?: string[]
): Promise<BinanceSymbolOrderBookTickerResponse> {
  const weight = BINANCE_WEIGHTS.orderBookTicker((symbol??[]).length);
  const response = await binance.get(
    BINANCE_ENDPOINTS.orderBookTicker(symbol),
    { weight }
  );
  return response.data;
}