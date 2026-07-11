import type { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";
import type { CandleInterval } from "@trading-model/common/config/event.types";
import type {
	Limit,
	TradingSymbol,
} from "@trading-model/common/domain/primitives";
import type { BinanceNormalizer } from "../../clients/binance/normalizer";

export interface BinanceWorkerOptions {
	symbol: TradingSymbol;
	interval?: CandleInterval;
	candleLimit?: Limit;
	tradeLimit?: Limit;
	orderBookLimit?: Limit;
	deliveryMode?: DeliveryMode;
}

export interface BinanceWorkerResult {
	orderBook?: ReturnType<typeof BinanceNormalizer.orderBook>;
	recentTrades?: ReturnType<typeof BinanceNormalizer.trades>;
	candles?: ReturnType<typeof BinanceNormalizer.candles>;
	ticker24h?: ReturnType<typeof BinanceNormalizer.ticker24h>;
	priceTicker?: ReturnType<typeof BinanceNormalizer.priceTicker>;
	bookTicker?: ReturnType<typeof BinanceNormalizer.bookTicker>;
	fetchedAt: number;
}
