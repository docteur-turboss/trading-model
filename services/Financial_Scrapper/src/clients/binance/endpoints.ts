export const BINANCE_ENDPOINTS = {
  /**
   * Binance order book
   * @param limit {number} - the order book limit; note that it increases request size (1–100: 5; 101–500: 25; 501–1000: 50; 1001–5000: 250)
   * @param symbol {string} - the symbol to fetch (e.g., BTCUSDT)
   * @returns {string} - the full endpoint
   */
  depth: (limit?: number, symbol?: string): string =>
    limit && symbol ? `/api/v3/depth?limit=${limit}&symbol=${symbol}` : `/api/v3/depth`,
  /**
   * List of recent trades, to use only for real-time data. Weight: 25.
   * @param limit {number} - maximum 500–1000
   * @param symbol {string} - the symbol to fetch (e.g., BTCUSDT)
   * @returns {string} - the full endpoint
   */
  trades: (limit?: number, symbol?: string): string =>
    limit && symbol ? `/api/v3/trades?limit=${limit}&symbol=${symbol}` : `/api/v3/trades`,
  /**
   * Historical trade list. Weight: 25.
   * @param limit {number} - maximum 500–1000
   * @param symbol {string} - the symbol to fetch (e.g., BTCUSDT)
   * @param fromId {string|number} - trade ID from which to start fetching
   * @returns {string} - the full endpoint
   */
  historicalTrades: (limit?: number, symbol?: string, fromId?: string | number): string =>
    limit && symbol && fromId
      ? `/api/v3/historicalTrades?limit=${limit}&symbol=${symbol}&fromId=${fromId}`
      : `/api/v3/historicalTrades`,
  /**
   * Compressed/Aggregate trades list. Weight: 4.
   * @param symbol {string} - the symbol to fetch (e.g., BTCUSDT)
   * @param fromId {string|number} - trade ID from which to start fetching
   * @param startTime {number} - timestamp in ms to start from (inclusive)
   * @param endTime {number} - timestamp in ms to end at (inclusive)
   * @param limit {number} - maximum 500-1000
   * @returns 
   */
  compressedAggregateTrades: (symbol?:string, fromId?:string|number, limit?: number): string => symbol && fromId && limit
    ? `/api/v3/aggTrades?symbol=${symbol}&fromId=${fromId}&limit=${limit}`
    : `/api/v3/aggTrades`,
  /**
   * Candlestick data. Weight: 2
   * @param symbol {string} - the symbol to fetch (e.g., BTCUSDT)
   * @param interval {string} - the candlestick interval
   * @param startTime {number} - timestamp in ms to start from (inclusive)
   * @param limit {number} - maximum 500-1000
   * @returns {string} - the full endpoint
   */
  candlesticks: (symbol?:string, interval?: "1s"|"1m"|"3m"|"5m"|"15m"|"30m"|"1h"|"2h"|"4h"|"6h"|"8h"|"12h"|"1d"|"3d"|"1w"|"1M", startTime?: number, limit?: number): string => 
    symbol && interval && startTime && limit
      ? `/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${startTime}&limit=${limit}`
      : `/api/v3/klines`,
  /**
   * 24hr ticker price change statistics.
   * @param symbol {string[]} - list of symbols to fetch stats for
   * @returns {string} - the full endpoint
   */
  change24hrStats: (symbol?: string[]): string => symbol && symbol.length > 0 ? `/api/v3/ticker/24hr?symbols=${encodeURIComponent(`[${symbol.map(e => `"${e}"`)}]`)}`: `/api/v3/ticker/24hr`,
  /**
   * Trading day ticker statistics.
   * @param symbols {string[]} - list of symbols to fetch stats for
   * @returns {string} - the full endpoint
   */
  TradingDayTicker: (symbol?: string[]): string => symbol && symbol.length > 0 ? `/api/v3/ticker/tradingDay?symbols=${encodeURIComponent(`[${symbol.map(e => `"${e}"`)}]`)}`: `/api/v3/ticker/tradingDay`,
  /**
   * Symbols price ticker.
   * @param symbols {string[]} - list of symbols to fetch stats for
   * @returns {string} - the full endpoint
   */
  symbolPriceTicker: (symbol?: string[]): string => symbol && symbol.length > 0 ? `/api/v3/ticker/price?symbols=${encodeURIComponent(`[${symbol.map(e => `"${e}"`)}]`)}`: `/api/v3/ticker/price`,
  /**
   * Order book ticker.
   * @param symbols {string[]} - list of symbols to fetch stats for
   * @returns {string} - the full endpoint
   */
  orderBookTicker: (symbol?: string[]): string => symbol && symbol.length > 0 ? `/api/v3/ticker/bookTicker?symbols=${encodeURIComponent(`[${symbol.map(e => `"${e}"`)}]`)}`: `/api/v3/ticker/bookTicker`,
};