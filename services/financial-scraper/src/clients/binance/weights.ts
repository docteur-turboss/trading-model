export type ApiWeight = number & { readonly brand: "ApiWeight" };

const WEIGHT = {
	DEPTH_LOW: 5,
	DEPTH_MED: 25,
	DEPTH_HIGH: 50,
	DEPTH_MAX: 250,
	TRADES: 25,
	HISTORICAL_TRADES: 25,
	AGGREGATE_TRADES: 4,
	CANDLESTICKS: 2,
	CHANGE_24HR_LOW: 2,
	CHANGE_24HR_MED: 40,
	CHANGE_24HR_HIGH: 80,
	TRADING_DAY_BASE: 4,
	TRADING_DAY_CAP: 200,
	PRICE_TICKER: 4,
	BOOK_TICKER: 4,
} as const satisfies Record<string, number>;

/** Binance API weight values per endpoint, used for rate-limit token accounting. */
export const BINANCE_WEIGHTS = {
	depth: (limit = 100): ApiWeight => {
		if (limit <= 100) {
			return WEIGHT.DEPTH_LOW as ApiWeight;
		}
		if (limit <= 500) {
			return WEIGHT.DEPTH_MED as ApiWeight;
		}
		if (limit <= 1000) {
			return WEIGHT.DEPTH_HIGH as ApiWeight;
		}
		return WEIGHT.DEPTH_MAX as ApiWeight;
	},
	trades: (): ApiWeight => WEIGHT.TRADES as ApiWeight,
	historicalTrades: (): ApiWeight => WEIGHT.HISTORICAL_TRADES as ApiWeight,
	compressedAggregateTrades: (): ApiWeight =>
		WEIGHT.AGGREGATE_TRADES as ApiWeight,
	candlesticks: (): ApiWeight => WEIGHT.CANDLESTICKS as ApiWeight,
	change24hrStats: (symbolLength: number): ApiWeight => {
		if (symbolLength <= 20 && symbolLength !== 0) {
			return WEIGHT.CHANGE_24HR_LOW as ApiWeight;
		}
		if (symbolLength <= 100) {
			return WEIGHT.CHANGE_24HR_MED as ApiWeight;
		}
		return WEIGHT.CHANGE_24HR_HIGH as ApiWeight;
	},
	tradingDayTicker: (symbolLength: number): ApiWeight => {
		if (symbolLength <= 49 && symbolLength !== 0) {
			return (WEIGHT.TRADING_DAY_BASE * symbolLength) as ApiWeight;
		}
		if (symbolLength <= 100) {
			return WEIGHT.TRADING_DAY_CAP as ApiWeight;
		}
		throw new Error(
			"Binance trading day ticker endpoint supports a maximum of 100 symbols per request and a minimum of 1."
		);
	},
	symbolPriceTicker: (_symbolLength: number): ApiWeight =>
		WEIGHT.PRICE_TICKER as ApiWeight,
	orderBookTicker: (_symbolLength: number): ApiWeight =>
		WEIGHT.BOOK_TICKER as ApiWeight,
};
