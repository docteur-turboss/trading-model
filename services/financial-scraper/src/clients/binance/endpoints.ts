export const BINANCE_ENDPOINTS = {
	/**
	 * Binance order book
	 * @param limit {number} - the order book limit; note that it increases request size (1–100: 5; 101–500: 25; 501–1000: 50; 1001–5000: 250)
	 * @param symbol {string} - the symbol to fetch (e.g., BTCUSDT)
	 * @returns {string} - the full endpoint
	 */
	depth: (symbol?: string, limit?: number): string =>
		symbol && limit
			? `/api/v3/depth?symbol=${symbol}&limit=${limit}`
			: "/api/v3/depth",
	/**
	 * List of recent trades, to use only for real-time data. Weight: 25.
	 * @param symbol {string} - the symbol to fetch (e.g., BTCUSDT)
	 * @param limit {number} - maximum 500–1000
	 * @returns {string} - the full endpoint
	 */
	trades: (symbol?: string, limit?: number): string =>
		symbol && limit
			? `/api/v3/trades?symbol=${symbol}&limit=${limit}`
			: "/api/v3/trades",
	/**
	 * Historical trade list. Weight: 25.
	 * @param symbol {string} - the symbol to fetch (e.g., BTCUSDT)
	 * @param limit {number} - maximum 500–1000
	 * @param fromId {string|number} - trade ID from which to start fetching
	 * @returns {string} - the full endpoint
	 */
	historicalTrades: (
		symbol?: string,
		limit?: number,
		fromId?: string | number
	): string =>
		symbol && limit && fromId
			? `/api/v3/historicalTrades?symbol=${symbol}&limit=${limit}&fromId=${fromId}`
			: "/api/v3/historicalTrades",
	/**
	 * Compressed/Aggregate trades list. Weight: 4.
	 * @param symbol {string} - the symbol to fetch (e.g., BTCUSDT)
	 * @param fromId {string|number} - trade ID from which to start fetching
	 * @param startTime {number} - timestamp in ms to start from (inclusive)
	 * @param endTime {number} - timestamp in ms to end at (inclusive)
	 * @param limit {number} - maximum 500-1000
	 * @returns
	 */
	compressedAggregateTrades: (
		symbol?: string,
		fromId?: string | number,
		limit?: number
	): string =>
		symbol && fromId && limit
			? `/api/v3/aggTrades?symbol=${symbol}&fromId=${fromId}&limit=${limit}`
			: "/api/v3/aggTrades",
	/**
	 * Candlestick data. Weight: 2
	 * @param symbol {string} - the symbol to fetch (e.g., BTCUSDT)
	 * @param interval {string} - the candlestick interval
	 * @param startTime {number} - timestamp in ms to start from (inclusive)
	 * @param limit {number} - maximum 500-1000
	 * @returns {string} - the full endpoint
	 */
	candlesticks: (
		symbol?: string,
		interval?: import("@trading-model/common/config/event.types").CandleInterval,
		startTime?: number,
		limit?: number
	): string =>
		symbol && interval && startTime && limit
			? `/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${startTime}&limit=${limit}`
			: "/api/v3/klines",
	/**
	 * 24hr ticker price change statistics.
	 * @param symbol {string[]} - list of symbols to fetch stats for
	 * @returns {string} - the full endpoint
	 */
	change24hrStats: (symbol?: string[]): string =>
		symbol && symbol.length > 0
			? `/api/v3/ticker/24hr?symbols=${encodeURIComponent(`[${symbol.map((entry) => `"${entry}"`)}]`)}`
			: "/api/v3/ticker/24hr",
	/**
	 * Trading day ticker statistics.
	 * @param symbols {string[]} - list of symbols to fetch stats for
	 * @returns {string} - the full endpoint
	 */
	tradingDayTicker: (symbol?: string[]): string =>
		symbol && symbol.length > 0
			? `/api/v3/ticker/tradingDay?symbols=${encodeURIComponent(`[${symbol.map((entry) => `"${entry}"`)}]`)}`
			: "/api/v3/ticker/tradingDay",
	/**
	 * Symbols price ticker.
	 * @param symbols {string[]} - list of symbols to fetch stats for
	 * @returns {string} - the full endpoint
	 */
	symbolPriceTicker: (symbol?: string[]): string =>
		symbol && symbol.length > 0
			? `/api/v3/ticker/price?symbols=${encodeURIComponent(`[${symbol.map((entry) => `"${entry}"`)}]`)}`
			: "/api/v3/ticker/price",
	/**
	 * Order book ticker.
	 * @param symbols {string[]} - list of symbols to fetch stats for
	 * @returns {string} - the full endpoint
	 */
	orderBookTicker: (symbol?: string[]): string =>
		symbol && symbol.length > 0
			? `/api/v3/ticker/bookTicker?symbols=${encodeURIComponent(`[${symbol.map((entry) => `"${entry}"`)}]`)}`
			: "/api/v3/ticker/bookTicker",
};
