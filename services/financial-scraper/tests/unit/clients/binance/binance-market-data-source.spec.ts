import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { CandleInterval } from "@trading-model/contracts/market-data.types";
import {
	DataSource,
	Limit,
	toSymbol,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";

jest.mock("../../../../src/adapters/outbound/binance/binance.client", () => ({
	getOrderBook: jest.fn(),
	getCandlestickData: jest.fn(),
	getRecentTrades: jest.fn(),
	getOrderBookTicker: jest.fn(),
	get24hrTickerStats: jest.fn(),
	getSymbolPriceTicker: jest.fn(),
}));

jest.mock("../../../../src/adapters/outbound/binance/normalizer", () => ({
	BinanceNormalizer: {
		orderBook: jest.fn(),
		trades: jest.fn(),
		candles: jest.fn(),
		ticker24h: jest.fn(),
		priceTicker: jest.fn(),
		bookTicker: jest.fn(),
	},
}));

jest.mock("@trading-model/http/infrastructure/logger", () => ({
	logger: {
		warn: jest.fn(),
		error: jest.fn(),
		info: jest.fn(),
		debug: jest.fn(),
	},
}));

import * as binanceClient from "../../../../src/adapters/outbound/binance/binance.client";
import { BinanceMarketDataSource } from "../../../../src/adapters/outbound/binance/binance-market-data-source";
import { BinanceNormalizer } from "../../../../src/adapters/outbound/binance/normalizer";
import { SNAPSHOT_PARTS_FAILED_TOTAL } from "../../../../src/config/metrics";

const BTC = toSymbol("BTCUSDT");
const ETH = toSymbol("ETHUSDT");

const LIMIT_50 = Limit.of(50, 5000);
const LIMIT_10 = Limit.of(10, 5000);
const LIMIT_100 = Limit.of(100, 5000);

const MOCK_GET_ORDER_BOOK = jest.mocked(binanceClient.getOrderBook);
const MOCK_CANDLESTICK_DATA = jest.mocked(binanceClient.getCandlestickData);
const MOCK_RECENT_TRADES = jest.mocked(binanceClient.getRecentTrades);
const MOCK_ORDER_BOOK_TICKER = jest.mocked(binanceClient.getOrderBookTicker);
const MOCK24HR_TICKER_STATS = jest.mocked(binanceClient.get24hrTickerStats);
const MOCK_SYMBOL_PRICE_TICKER = jest.mocked(
	binanceClient.getSymbolPriceTicker
);

const MOCK_NORMALIZER_ORDER_BOOK = jest.mocked(BinanceNormalizer.orderBook);
const MOCK_NORMALIZER_TRADES = jest.mocked(BinanceNormalizer.trades);
const MOCK_NORMALIZER_CANDLES = jest.mocked(BinanceNormalizer.candles);
const MOCK_NORMALIZER_TICKER24H = jest.mocked(BinanceNormalizer.ticker24h);
const MOCK_NORMALIZER_PRICE_TICKER = jest.mocked(BinanceNormalizer.priceTicker);
const MOCK_NORMALIZER_BOOK_TICKER = jest.mocked(BinanceNormalizer.bookTicker);

describe("BinanceMarketDataSource", () => {
	const source = new BinanceMarketDataSource();
	const request = {
		symbol: BTC,
		interval: CandleInterval.Min1,
		candleLimit: LIMIT_50,
		tradeLimit: LIMIT_50,
		orderBookLimit: LIMIT_10,
	};

	const mockNormalized = {
		orderBook: { symbol: BTC },
		recentTrades: [{ tradeId: 1 }],
		candles: [
			{ symbol: BTC, interval: CandleInterval.Min1, closeTimestamp: 1 },
		],
		ticker24h: [{ symbol: BTC }],
		priceTicker: { BTCUSDT: 50000 },
		bookTicker: [{ symbol: BTC }],
	};

	beforeEach(() => {
		jest.clearAllMocks();

		MOCK_GET_ORDER_BOOK.mockResolvedValue({
			bids: [],
			asks: [],
			lastUpdateId: 0,
		});
		MOCK_CANDLESTICK_DATA.mockResolvedValue([]);
		MOCK_RECENT_TRADES.mockResolvedValue([]);
		MOCK_ORDER_BOOK_TICKER.mockResolvedValue([]);
		MOCK24HR_TICKER_STATS.mockResolvedValue([]);
		MOCK_SYMBOL_PRICE_TICKER.mockResolvedValue([]);

		MOCK_NORMALIZER_ORDER_BOOK.mockReturnValue(
			mockNormalized.orderBook as never
		);
		MOCK_NORMALIZER_TRADES.mockReturnValue(
			mockNormalized.recentTrades as never
		);
		MOCK_NORMALIZER_CANDLES.mockReturnValue(mockNormalized.candles as never);
		MOCK_NORMALIZER_TICKER24H.mockReturnValue(
			mockNormalized.ticker24h as never
		);
		MOCK_NORMALIZER_PRICE_TICKER.mockReturnValue(
			mockNormalized.priceTicker as never
		);
		MOCK_NORMALIZER_BOOK_TICKER.mockReturnValue(
			mockNormalized.bookTicker as never
		);
	});

	it("should identify itself as the Binance source", () => {
		expect(source.id).toBe(DataSource.Binance);
	});

	describe("fetchSnapshot", () => {
		it("should call all 6 Binance client functions in parallel", async () => {
			await source.fetchSnapshot(request);

			expect(MOCK_GET_ORDER_BOOK).toHaveBeenCalledWith({
				symbol: BTC,
				limit: LIMIT_10,
			});
			expect(MOCK_RECENT_TRADES).toHaveBeenCalledWith({
				symbol: BTC,
				limit: LIMIT_50,
			});
			expect(MOCK_CANDLESTICK_DATA).toHaveBeenCalledWith({
				symbol: BTC,
				limit: LIMIT_50,
				interval: CandleInterval.Min1,
			});
			expect(MOCK24HR_TICKER_STATS).toHaveBeenCalledWith([BTC]);
			expect(MOCK_SYMBOL_PRICE_TICKER).toHaveBeenCalledWith([BTC]);
			expect(MOCK_ORDER_BOOK_TICKER).toHaveBeenCalledWith([BTC]);
		});

		it("should fetch candles from the given start time", async () => {
			const startTime = UnixTimestamp.of(1_700_000_000_000);
			await source.fetchSnapshot({
				symbol: BTC,
				interval: CandleInterval.Min1,
				candleStartTime: startTime,
			});

			expect(MOCK_CANDLESTICK_DATA).toHaveBeenCalledWith(
				expect.objectContaining({ startTime })
			);
		});

		it("should leave out the candle that is still open", async () => {
			const now = Date.now();
			const closed = { symbol: BTC, closeTimestamp: now - 1 };
			const open = { symbol: BTC, closeTimestamp: now + 60_000 };
			MOCK_NORMALIZER_CANDLES.mockReturnValue([closed, open] as never);

			const result = await source.fetchSnapshot(request);

			expect(result.candles).toEqual([closed]);
		});

		it("should normalize all raw responses", async () => {
			await source.fetchSnapshot(request);

			expect(MOCK_NORMALIZER_ORDER_BOOK).toHaveBeenCalled();
			expect(MOCK_NORMALIZER_TRADES).toHaveBeenCalled();
			expect(MOCK_NORMALIZER_CANDLES).toHaveBeenCalled();
			expect(MOCK_NORMALIZER_TICKER24H).toHaveBeenCalled();
			expect(MOCK_NORMALIZER_PRICE_TICKER).toHaveBeenCalled();
			expect(MOCK_NORMALIZER_BOOK_TICKER).toHaveBeenCalled();
		});

		it("should return normalized result with fetchedAt", async () => {
			const result = await source.fetchSnapshot(request);

			expect(result.orderBook).toEqual(mockNormalized.orderBook);
			expect(result.recentTrades).toEqual(mockNormalized.recentTrades);
			expect(result.candles).toEqual(mockNormalized.candles);
			expect(result.ticker24h).toEqual(mockNormalized.ticker24h);
			expect(result.priceTicker).toEqual(mockNormalized.priceTicker);
			expect(result.bookTicker).toEqual(mockNormalized.bookTicker);
			expect(typeof result.fetchedAt).toBe("number");
		});

		it("should keep the other parts when one endpoint fails", async () => {
			SNAPSHOT_PARTS_FAILED_TOTAL.reset();
			MOCK_GET_ORDER_BOOK.mockRejectedValueOnce(new Error("depth 500"));

			const result = await source.fetchSnapshot(request);

			expect(result.orderBook).toBeUndefined();
			expect(MOCK_NORMALIZER_ORDER_BOOK).not.toHaveBeenCalled();
			expect(result.candles).toEqual(mockNormalized.candles);
			expect(result.recentTrades).toEqual(mockNormalized.recentTrades);
			const counted = await SNAPSHOT_PARTS_FAILED_TOTAL.get();
			expect(counted.values).toEqual([
				expect.objectContaining({ labels: { part: "orderBook" }, value: 1 }),
			]);
		});

		it("should reject with the first error when every endpoint fails", async () => {
			const restricted = new Error("451 restricted location");
			for (const mock of [
				MOCK_GET_ORDER_BOOK,
				MOCK_RECENT_TRADES,
				MOCK_CANDLESTICK_DATA,
				MOCK24HR_TICKER_STATS,
				MOCK_SYMBOL_PRICE_TICKER,
				MOCK_ORDER_BOOK_TICKER,
			]) {
				mock.mockRejectedValueOnce(restricted);
			}

			await expect(source.fetchSnapshot(request)).rejects.toThrow(
				"451 restricted location"
			);
		});

		it("should use default options when not provided", async () => {
			await source.fetchSnapshot({ symbol: ETH });

			expect(MOCK_RECENT_TRADES).toHaveBeenCalledWith({
				symbol: ETH,
				limit: LIMIT_100,
			});
			expect(MOCK_CANDLESTICK_DATA).toHaveBeenCalledWith({
				symbol: ETH,
				limit: LIMIT_100,
				interval: CandleInterval.Min1,
			});
		});
	});
});
