export type ApiWeight = number & { readonly brand: "ApiWeight" };

const WEIGHT = {
	DEPTH_LOW: 5 as ApiWeight,
	DEPTH_MED: 25 as ApiWeight,
	DEPTH_HIGH: 50 as ApiWeight,
	DEPTH_MAX: 250 as ApiWeight,
	TRADES: 25 as ApiWeight,
	CANDLESTICKS: 2 as ApiWeight,
	CHANGE_24HR_LOW: 2 as ApiWeight,
	CHANGE_24HR_MED: 40 as ApiWeight,
	CHANGE_24HR_HIGH: 80 as ApiWeight,
	PRICE_TICKER: 4 as ApiWeight,
	BOOK_TICKER: 4 as ApiWeight,
} as const satisfies Record<string, ApiWeight>;

/** Binance API weight values per endpoint, used for rate-limit token accounting. */
export const BINANCE_WEIGHTS = {
	depth: (limit = 100): ApiWeight => {
		if (limit <= 100) {
			return WEIGHT.DEPTH_LOW;
		}
		if (limit <= 500) {
			return WEIGHT.DEPTH_MED;
		}
		if (limit <= 1000) {
			return WEIGHT.DEPTH_HIGH;
		}
		return WEIGHT.DEPTH_MAX;
	},
	trades: (): ApiWeight => WEIGHT.TRADES,
	candlesticks: (): ApiWeight => WEIGHT.CANDLESTICKS,
	change24hrStats: (symbolLength: number): ApiWeight => {
		if (symbolLength <= 20 && symbolLength !== 0) {
			return WEIGHT.CHANGE_24HR_LOW;
		}
		if (symbolLength <= 100) {
			return WEIGHT.CHANGE_24HR_MED;
		}
		return WEIGHT.CHANGE_24HR_HIGH;
	},
	symbolPriceTicker: (_symbolLength: number): ApiWeight => WEIGHT.PRICE_TICKER,
	orderBookTicker: (_symbolLength: number): ApiWeight => WEIGHT.BOOK_TICKER,
};
