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
		{ price: "0.0024" as any, qty: "10.0" as any },
		{ price: "0.0023" as any, qty: "5.0" as any },
	] as BinanceDepthEntry[],
	asks: [
		{ price: "0.0026" as any, qty: "8.0" as any },
		{ price: "0.0027" as any, qty: "3.0" as any },
	] as BinanceDepthEntry[],
};

export const mockTradeResponse: BinanceTradeResponse = [
	{
		id: 28457,
		price: "4.00000100" as any,
		qty: "12.00000000" as any,
		quoteQty: "0.00004800" as any,
		time: 1499865549590 as any,
		isBuyerMaker: true,
		isBestMatch: true,
	},
	{
		id: 28458,
		price: "4.00000200" as any,
		qty: "8.00000000" as any,
		quoteQty: "0.00003200" as any,
		time: 1499865549591 as any,
		isBuyerMaker: false,
		isBestMatch: true,
	},
];

export const mockHistoricalTradeResponse: BinanceHistoricalTrade[] = [
	{
		id: 28457,
		price: "4.00000100" as any,
		qty: "12.00000000" as any,
		quoteQty: "0.00004800" as any,
		time: 1499865549590 as any,
		isBuyerMaker: true,
		isBestMatch: true,
	},
];

export const mockAggregateTradeResponse: BinanceAggregateTradeResponse = [
	{
		aggregateTradeId: 28457,
		price: "4.00000100" as any,
		quantity: "12.00000000" as any,
		firstTradeId: 1,
		lastTradeId: 2,
		time: 1499865549590 as any,
		isBuyerMaker: true,
		isBestMatch: true,
	},
];

export const mockCandlestickResponse: BinanceCandlestickData[] = [
	{
		openTime: 1499040000000 as any,
		open: "0.01634790" as any,
		high: "0.80000000" as any,
		low: "0.01575800" as any,
		close: "0.01577100" as any,
		volume: "148976.11427815" as any,
		closeTime: 1499644799999 as any,
		quoteAssetVolume: "2434.19055334" as any,
		numberOfTrades: 308,
		takerBuyBaseAssetVolume: "1756.87402397" as any,
		takerBuyQuoteAssetVolume: "28.46694368" as any,
	},
];

export const mock24hrTickerResponse: Binance24hrTickerStats[] = [
	{
		symbol: "BTCUSDT" as any,
		priceChange: "-94.99999800" as any,
		priceChangePercent: "-95.960" as any,
		weightedAvgPrice: "0.29628482" as any,
		prevClosePrice: "99.00000000" as any,
		openPrice: "99.00000000" as any,
		highPrice: "100.00000000" as any,
		lowPrice: "0.10000000" as any,
		lastPrice: "4.00000200" as any,
		bidPrice: "4.00000000" as any,
		bidQty: "10.00000000" as any,
		askPrice: "4.00000200" as any,
		askQty: "10.00000000" as any,
		volume: "8913.30000000" as any,
		openTime: 1499783040000 as any,
		closeTime: 1499869440000 as any,
		firstId: 28385,
		lastId: 28460,
		count: 76,
	},
];

export const mockTradingDayTickerResponse: BinanceTradingDayTicker[] = [
	{
		symbol: "BTCUSDT" as any,
		priceChange: "-94.99999800" as any,
		priceChangePercent: "-95.960" as any,
		weightedAvgPrice: "0.29628482" as any,
		openPrice: "99.00000000" as any,
		highPrice: "100.00000000" as any,
		lowPrice: "0.10000000" as any,
		lastPrice: "4.00000200" as any,
		volume: "8913.30000000" as any,
		quoteVolume: "15.30000000" as any,
		openTime: 1499783040000 as any,
		closeTime: 1499869440000 as any,
		firstId: 28385,
		lastId: 28460,
		count: 76,
	},
];

export const mockPriceTickerResponse: BinanceSymbolPriceTicker[] = [
	{
		symbol: "BTCUSDT" as any,
		price: "50000.00" as any,
	},
];

export const mockBookTickerResponse: BinanceSymbolOrderBookTicker[] = [
	{
		symbol: "BTCUSDT" as any,
		bidPrice: "49990.00" as any,
		bidQty: "0.50000000" as any,
		askPrice: "50010.00" as any,
		askQty: "1.00000000" as any,
	},
];
