import type {
	Binance24hrTickerStats,
	BinanceAggregateTradeResponse,
	BinanceCandlestickData,
	BinanceDepthEntry,
	BinanceDepthResponse,
	BinanceHistoricalTrade,
	BinanceSymbolOrderBookTicker,
	BinanceSymbolPriceTicker,
	BinanceTradeResponse,
	BinanceTradingDayTicker,
} from "../../src/types/binance.api";

export const mockDepthResponse: BinanceDepthResponse = {
	lastUpdateId: 1027024,
	bids: [
		{ price: "0.0024", qty: "10.0" },
		{ price: "0.0023", qty: "5.0" },
	] as BinanceDepthEntry[],
	asks: [
		{ price: "0.0026", qty: "8.0" },
		{ price: "0.0027", qty: "3.0" },
	] as BinanceDepthEntry[],
};

export const mockTradeResponse: BinanceTradeResponse = [
	{
		id: 28457,
		price: "4.00000100",
		qty: "12.00000000",
		quoteQty: "0.00004800",
		time: 1499865549590 as unknown as import("@trading-model/common/domain/primitives").UnixTimestamp,
		isBuyerMaker: true,
		isBestMatch: true,
	},
	{
		id: 28458,
		price: "4.00000200",
		qty: "8.00000000",
		quoteQty: "0.00003200",
		time: 1499865549591 as unknown as import("@trading-model/common/domain/primitives").UnixTimestamp,
		isBuyerMaker: false,
		isBestMatch: true,
	},
];

export const mockHistoricalTradeResponse: BinanceHistoricalTrade[] = [
	{
		id: 28457,
		price: "4.00000100",
		qty: "12.00000000",
		quoteQty: "0.00004800",
		time: 1499865549590 as unknown as import("@trading-model/common/domain/primitives").UnixTimestamp,
		isBuyerMaker: true,
		isBestMatch: true,
	},
];

export const mockAggregateTradeResponse: BinanceAggregateTradeResponse = [
	{
		aggregateTradeId: 28457,
		price: "4.00000100",
		quantity: "12.00000000",
		firstTradeId: 1,
		lastTradeId: 2,
		time: 1499865549590 as unknown as import("@trading-model/common/domain/primitives").UnixTimestamp,
		isBuyerMaker: true,
		isBestMatch: true,
	},
];

export const mockCandlestickResponse: BinanceCandlestickData[] = [
	{
		openTime:
			1499040000000 as unknown as import("@trading-model/common/domain/primitives").UnixTimestamp,
		open: "0.01634790",
		high: "0.80000000",
		low: "0.01575800",
		close: "0.01577100",
		volume: "148976.11427815",
		closeTime:
			1499644799999 as unknown as import("@trading-model/common/domain/primitives").UnixTimestamp,
		quoteAssetVolume: "2434.19055334",
		numberOfTrades: 308,
		takerBuyBaseAssetVolume: "1756.87402397",
		takerBuyQuoteAssetVolume: "28.46694368",
	},
];

export const mock24hrTickerResponse: Binance24hrTickerStats[] = [
	{
		symbol:
			"BTCUSDT" as import("@trading-model/common/domain/primitives").TradingSymbol,
		priceChange: "-94.99999800",
		priceChangePercent: "-95.960",
		weightedAvgPrice: "0.29628482",
		prevClosePrice: "99.00000000",
		openPrice: "99.00000000",
		highPrice: "100.00000000",
		lowPrice: "0.10000000",
		lastPrice: "4.00000200",
		bidPrice: "4.00000000",
		bidQty: "10.00000000",
		askPrice: "4.00000200",
		askQty: "10.00000000",
		volume: "8913.30000000",
		openTime:
			1499783040000 as unknown as import("@trading-model/common/domain/primitives").UnixTimestamp,
		closeTime:
			1499869440000 as unknown as import("@trading-model/common/domain/primitives").UnixTimestamp,
		firstId: 28385,
		lastId: 28460,
		count: 76,
	},
];

export const mockTradingDayTickerResponse: BinanceTradingDayTicker[] = [
	{
		symbol:
			"BTCUSDT" as import("@trading-model/common/domain/primitives").TradingSymbol,
		priceChange: "-94.99999800",
		priceChangePercent: "-95.960",
		weightedAvgPrice: "0.29628482",
		openPrice: "99.00000000",
		highPrice: "100.00000000",
		lowPrice: "0.10000000",
		lastPrice: "4.00000200",
		volume: "8913.30000000",
		quoteVolume: "15.30000000",
		openTime:
			1499783040000 as unknown as import("@trading-model/common/domain/primitives").UnixTimestamp,
		closeTime:
			1499869440000 as unknown as import("@trading-model/common/domain/primitives").UnixTimestamp,
		firstId: 28385,
		lastId: 28460,
		count: 76,
	},
];

export const mockPriceTickerResponse: BinanceSymbolPriceTicker[] = [
	{
		symbol:
			"BTCUSDT" as import("@trading-model/common/domain/primitives").TradingSymbol,
		price: "50000.00",
	},
];

export const mockBookTickerResponse: BinanceSymbolOrderBookTicker[] = [
	{
		symbol:
			"BTCUSDT" as import("@trading-model/common/domain/primitives").TradingSymbol,
		bidPrice: "49990.00",
		bidQty: "0.50000000",
		askPrice: "50010.00",
		askQty: "1.00000000",
	},
];
