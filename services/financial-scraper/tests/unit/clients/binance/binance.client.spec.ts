import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { CandleInterval } from "@trading-model/common/config/event.types";
import {
	BinanceFromId,
	Limit,
	toSymbol,
} from "@trading-model/common/domain/primitives";

jest.mock("../../../../src/config/http", () => ({
	httpClients: {
		binance: {
			get: jest.fn<(...args: any[]) => any>(),
		},
	},
}));

jest.mock("../../../../src/clients/binance/endpoints", () => ({
	BINANCE_ENDPOINTS: {
		depth: jest.fn(() => "/api/v3/depth"),
		trades: jest.fn(() => "/api/v3/trades"),
		historicalTrades: jest.fn(() => "/api/v3/historicalTrades"),
		compressedAggregateTrades: jest.fn(() => "/api/v3/aggTrades"),
		candlesticks: jest.fn(() => "/api/v3/klines"),
		change24hrStats: jest.fn(() => "/api/v3/ticker/24hr"),
		tradingDayTicker: jest.fn(() => "/api/v3/ticker/tradingDay"),
		symbolPriceTicker: jest.fn(() => "/api/v3/ticker/price"),
		orderBookTicker: jest.fn(() => "/api/v3/ticker/bookTicker"),
	},
}));

jest.mock("../../../../src/clients/binance/weights", () => ({
	BINANCE_WEIGHTS: {
		depth: jest.fn(() => 5),
		trades: jest.fn(() => 25),
		historicalTrades: jest.fn(() => 25),
		compressedAggregateTrades: jest.fn(() => 4),
		candlesticks: jest.fn(() => 2),
		change24hrStats: jest.fn(() => 2),
		tradingDayTicker: jest.fn(() => 4),
		symbolPriceTicker: jest.fn(() => 4),
		orderBookTicker: jest.fn(() => 4),
	},
}));

import {
	get24hrTickerStats,
	getCandlestickData,
	getCompressedAggregateTrades,
	getHistoricalTrades,
	getOrderBook,
	getOrderBookTicker,
	getRecentTrades,
	getSymbolPriceTicker,
	getTradingDayTicker,
} from "../../../../src/clients/binance/binance.client";
import { httpClients } from "../../../../src/config/http";

const BTC = toSymbol("BTCUSDT");
const MOCK_GET = jest.mocked(httpClients.binance.get);

const LIMIT_100 = Limit.of(100, 5000);
const LIMIT_500 = Limit.of(500, 5000);

describe("BinanceClient", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		MOCK_GET.mockResolvedValue({ data: [] });
	});

	it("getOrderBook should call depth endpoint with weight", async () => {
		await getOrderBook({ symbol: BTC, limit: LIMIT_100 });
		expect(MOCK_GET).toHaveBeenCalledWith("/api/v3/depth", {
			weight: 5,
		} as never);
	});

	it("getOrderBook should use default limit", async () => {
		await getOrderBook({ symbol: BTC });
		expect(MOCK_GET).toHaveBeenCalledWith("/api/v3/depth", {
			weight: 5,
		} as never);
	});

	it("getRecentTrades should call trades endpoint with weight", async () => {
		await getRecentTrades({ symbol: BTC, limit: LIMIT_100 });
		expect(MOCK_GET).toHaveBeenCalledWith("/api/v3/trades", {
			weight: 25,
		} as never);
	});

	it("getRecentTrades should use default limit", async () => {
		await getRecentTrades({ symbol: BTC });
		expect(MOCK_GET).toHaveBeenCalledWith("/api/v3/trades", {
			weight: 25,
		} as never);
	});

	it("getHistoricalTrades should call historicalTrades endpoint with weight", async () => {
		await getHistoricalTrades({
			symbol: BTC,
			limit: LIMIT_100,
			fromId: BinanceFromId.of(12345),
		});
		expect(MOCK_GET).toHaveBeenCalledWith("/api/v3/historicalTrades", {
			weight: 25,
		} as never);
	});

	it("getHistoricalTrades should use default limit", async () => {
		await getHistoricalTrades({
			symbol: BTC,
			limit: LIMIT_500,
			fromId: BinanceFromId.of(12345),
		});
		expect(MOCK_GET).toHaveBeenCalledWith("/api/v3/historicalTrades", {
			weight: 25,
		} as never);
	});

	it("getCandlestickData should call candlesticks endpoint with weight", async () => {
		await getCandlestickData({
			symbol: BTC,
			limit: LIMIT_100,
			interval: CandleInterval.Min1,
		});
		expect(MOCK_GET).toHaveBeenCalledWith("/api/v3/klines", {
			weight: 2,
		} as never);
	});

	it("getCandlestickData should use default limit", async () => {
		await getCandlestickData({
			symbol: BTC,
			limit: LIMIT_500,
			interval: CandleInterval.Min1,
		});
		expect(MOCK_GET).toHaveBeenCalledWith("/api/v3/klines", {
			weight: 2,
		} as never);
	});

	it("getCompressedAggregateTrades should call aggTrades endpoint with weight", async () => {
		await getCompressedAggregateTrades({
			symbol: BTC,
			fromId: BinanceFromId.of(12345),
			limit: LIMIT_100,
		});
		expect(MOCK_GET).toHaveBeenCalledWith("/api/v3/aggTrades", {
			weight: 4,
		} as never);
	});

	it("getCompressedAggregateTrades should use default limit", async () => {
		await getCompressedAggregateTrades({
			symbol: BTC,
			fromId: BinanceFromId.of(12345),
		});
		expect(MOCK_GET).toHaveBeenCalledWith("/api/v3/aggTrades", {
			weight: 4,
		} as never);
	});

	it("getTradingDayTicker should call tradingDay endpoint with weight", async () => {
		await getTradingDayTicker([BTC]);
		expect(MOCK_GET).toHaveBeenCalledWith("/api/v3/ticker/tradingDay", {
			weight: 4,
		} as never);
	});

	it("get24hrTickerStats should call 24hr endpoint with weight", async () => {
		await get24hrTickerStats([BTC]);
		expect(MOCK_GET).toHaveBeenCalledWith("/api/v3/ticker/24hr", {
			weight: 2,
		} as never);
	});

	it("get24hrTickerStats should handle undefined symbol", async () => {
		await get24hrTickerStats();
		expect(MOCK_GET).toHaveBeenCalledWith("/api/v3/ticker/24hr", {
			weight: 2,
		} as never);
	});

	it("getSymbolPriceTicker should call price endpoint with weight", async () => {
		await getSymbolPriceTicker([BTC]);
		expect(MOCK_GET).toHaveBeenCalledWith("/api/v3/ticker/price", {
			weight: 4,
		} as never);
	});

	it("getSymbolPriceTicker should handle undefined symbol", async () => {
		await getSymbolPriceTicker();
		expect(MOCK_GET).toHaveBeenCalledWith("/api/v3/ticker/price", {
			weight: 4,
		} as never);
	});

	it("getOrderBookTicker should call bookTicker endpoint with weight", async () => {
		await getOrderBookTicker([BTC]);
		expect(MOCK_GET).toHaveBeenCalledWith("/api/v3/ticker/bookTicker", {
			weight: 4,
		} as never);
	});

	it("getOrderBookTicker should handle undefined symbol", async () => {
		await getOrderBookTicker();
		expect(MOCK_GET).toHaveBeenCalledWith("/api/v3/ticker/bookTicker", {
			weight: 4,
		} as never);
	});
});
