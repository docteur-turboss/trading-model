import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import { CandleInterval } from "@trading-model/contracts/market-data.types";
import {
	DataSource,
	Limit,
	toSymbol,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";

jest.mock(
	"../../../../../src/adapters/outbound/binance/binance.client",
	() => ({
		getOrderBook: jest.fn<(...args: any[]) => any>(),
		getCandlestickData: jest.fn<(...args: any[]) => any>(),
		getRecentTrades: jest.fn<(...args: any[]) => any>(),
		get24hrTickerStats: jest.fn<(...args: any[]) => any>(),
	})
);

jest.mock(
	"../../../../../src/adapters/outbound/binance/normalizers/order-book",
	() => ({
		normalizeOrderBook: jest.fn<(...args: any[]) => any>(),
	})
);

jest.mock(
	"../../../../../src/adapters/outbound/binance/normalizers/trades",
	() => ({
		normalizeTrades: jest.fn<(...args: any[]) => any>(),
	})
);

jest.mock(
	"../../../../../src/adapters/outbound/binance/normalizers/candles",
	() => ({
		normalizeCandles: jest.fn<(...args: any[]) => any>(),
	})
);

jest.mock(
	"../../../../../src/adapters/outbound/binance/normalizers/ticker",
	() => ({
		normalizeTicker24h: jest.fn<(...args: any[]) => any>(),
	})
);

jest.mock("@trading-model/http/logger", () => ({
	logger: {
		warn: jest.fn<(...args: any[]) => any>(),
		error: jest.fn<(...args: any[]) => any>(),
		info: jest.fn<(...args: any[]) => any>(),
		debug: jest.fn<(...args: any[]) => any>(),
	},
}));

import * as binanceClient from "../../../../../src/adapters/outbound/binance/binance.client";
import { BinanceMarketDataSource } from "../../../../../src/adapters/outbound/binance/binance-market-data-source";
import { normalizeCandles } from "../../../../../src/adapters/outbound/binance/normalizers/candles";
import { normalizeOrderBook } from "../../../../../src/adapters/outbound/binance/normalizers/order-book";
import { normalizeTicker24h } from "../../../../../src/adapters/outbound/binance/normalizers/ticker";
import { normalizeTrades } from "../../../../../src/adapters/outbound/binance/normalizers/trades";
import { SNAPSHOT_PARTS_FAILED_TOTAL } from "../../../../../src/config/metrics";

const BTC = toSymbol("BTCUSDT");
const ETH = toSymbol("ETHUSDT");

const LIMIT_50 = Limit.of(50, 5000);
const LIMIT_10 = Limit.of(10, 5000);
const LIMIT_100 = Limit.of(100, 5000);

const MOCK_GET_ORDER_BOOK = jest.mocked(binanceClient.getOrderBook);
const MOCK_CANDLESTICK_DATA = jest.mocked(binanceClient.getCandlestickData);
const MOCK_RECENT_TRADES = jest.mocked(binanceClient.getRecentTrades);
const MOCK24HR_TICKER_STATS = jest.mocked(binanceClient.get24hrTickerStats);

const MOCK_NORMALIZER_ORDER_BOOK = jest.mocked(normalizeOrderBook);
const MOCK_NORMALIZER_TRADES = jest.mocked(normalizeTrades);
const MOCK_NORMALIZER_CANDLES = jest.mocked(normalizeCandles);
const MOCK_NORMALIZER_TICKER24H = jest.mocked(normalizeTicker24h);

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
		MOCK24HR_TICKER_STATS.mockResolvedValue([]);

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
	});

	it("should identify itself as the Binance source", () => {
		expect(source.id).toBe(DataSource.Binance);
	});

	describe("beginCycle", () => {
		it("fetches each ticker endpoint once for all symbols and isolates a missing one", async () => {
			MOCK24HR_TICKER_STATS.mockResolvedValueOnce([{ symbol: BTC }] as any);
			const cycle = new BinanceMarketDataSource();
			cycle.beginCycle([BTC, ETH]);
			await cycle.fetchSnapshot({ symbol: BTC });
			const eth = await cycle.fetchSnapshot({ symbol: ETH });

			expect(MOCK24HR_TICKER_STATS).toHaveBeenCalledTimes(1);
			expect(MOCK24HR_TICKER_STATS).toHaveBeenCalledWith([BTC, ETH], undefined);
			expect(eth.ticker24h).toBeUndefined();
		});
	});

	it("asks for all symbols (undefined) above 100 symbols", () => {
		const many = Array.from({ length: 101 }, (_, i) => `S${i}USDT`) as any[];
		new BinanceMarketDataSource().beginCycle(many);

		expect(MOCK24HR_TICKER_STATS).toHaveBeenCalledWith(undefined, undefined);
	});

	describe("fetchSnapshot", () => {
		it("should call all 6 Binance client functions in parallel", async () => {
			await source.fetchSnapshot(request);

			expect(MOCK_GET_ORDER_BOOK).toHaveBeenCalledWith(
				{
					symbol: BTC,
					limit: LIMIT_10,
				},
				undefined
			);
			expect(MOCK_RECENT_TRADES).toHaveBeenCalledWith(
				{
					symbol: BTC,
					limit: LIMIT_50,
				},
				undefined
			);
			expect(MOCK_CANDLESTICK_DATA).toHaveBeenCalledWith(
				{
					symbol: BTC,
					limit: LIMIT_50,
					interval: CandleInterval.Min1,
				},
				undefined
			);
			expect(MOCK24HR_TICKER_STATS).toHaveBeenCalledWith([BTC], undefined);
		});

		it("should fetch candles from the given start time", async () => {
			const startTime = UnixTimestamp.of(1_700_000_000_000);
			await source.fetchSnapshot({
				symbol: BTC,
				interval: CandleInterval.Min1,
				candleStartTime: startTime,
			});

			expect(MOCK_CANDLESTICK_DATA).toHaveBeenCalledWith(
				expect.objectContaining({ startTime }),
				undefined
			);
		});

		it("should leave out the candle that is still open", async () => {
			const now = Date.now();
			const closed = { symbol: BTC, closeTimestamp: now - 5_000 };
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
		});

		it("should return normalized result with fetchedAt", async () => {
			const result = await source.fetchSnapshot(request);

			expect(result.orderBook).toEqual(mockNormalized.orderBook);
			expect(result.recentTrades).toEqual(mockNormalized.recentTrades);
			expect(result.candles).toEqual(mockNormalized.candles);
			expect(result.ticker24h).toEqual(mockNormalized.ticker24h);
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

		describe("429/418/451 quarantine", () => {
			const ban = (status: number, retryAfter?: string) =>
				Object.assign(new Error(String(status)), {
					response: { status, headers: { "retry-after": retryAfter } },
				});
			const failAll = (error: Error) => {
				for (const mock of [
					MOCK_GET_ORDER_BOOK,
					MOCK_RECENT_TRADES,
					MOCK_CANDLESTICK_DATA,
					MOCK24HR_TICKER_STATS,
				]) {
					mock.mockRejectedValueOnce(error);
				}
			};

			beforeEach(() => {
				jest.useFakeTimers({ now: 1_000_000 });
			});
			afterEach(() => {
				jest.useRealTimers();
			});

			it.each([429, 418, 451])(
				"makes no call after a %i until the backoff ends, then probes",
				async (status) => {
					const banned = new BinanceMarketDataSource();
					failAll(ban(status));
					await expect(banned.fetchSnapshot(request)).rejects.toThrow();
					MOCK_GET_ORDER_BOOK.mockClear();
					MOCK24HR_TICKER_STATS.mockClear();

					jest.advanceTimersByTime(60_000);
					banned.beginCycle([BTC]);
					await expect(banned.fetchSnapshot(request)).rejects.toThrow(
						"quarantined"
					);
					expect(MOCK_GET_ORDER_BOOK).not.toHaveBeenCalled();
					expect(MOCK24HR_TICKER_STATS).not.toHaveBeenCalled();

					jest.advanceTimersByTime(5 * 60_000);
					await banned.fetchSnapshot(request);
					expect(MOCK_GET_ORDER_BOOK).toHaveBeenCalledTimes(1);
				}
			);

			it("quarantines on a 418 of one endpoint while the others answer", async () => {
				const banned = new BinanceMarketDataSource();
				MOCK_GET_ORDER_BOOK.mockRejectedValueOnce(ban(418));
				await banned.fetchSnapshot(request);
				MOCK_GET_ORDER_BOOK.mockClear();

				banned.beginCycle([BTC]);
				await expect(banned.fetchSnapshot(request)).rejects.toThrow(
					"quarantined"
				);
				expect(MOCK_GET_ORDER_BOOK).not.toHaveBeenCalled();
			});

			it("holds until a Retry-After given as an HTTP date", async () => {
				const banned = new BinanceMarketDataSource();
				failAll(ban(418, new Date(1_000_000 + 3_600_000).toUTCString()));
				await expect(banned.fetchSnapshot(request)).rejects.toThrow();

				jest.advanceTimersByTime(3_000_000);
				await expect(banned.fetchSnapshot(request)).rejects.toThrow(
					"quarantined"
				);
				jest.advanceTimersByTime(700_000);
				await banned.fetchSnapshot(request);
			});
		});

		it("should reject with the first error when every endpoint fails", async () => {
			const restricted = new Error("451 restricted location");
			for (const mock of [
				MOCK_GET_ORDER_BOOK,
				MOCK_RECENT_TRADES,
				MOCK_CANDLESTICK_DATA,
				MOCK24HR_TICKER_STATS,
			]) {
				mock.mockRejectedValueOnce(restricted);
			}

			await expect(source.fetchSnapshot(request)).rejects.toThrow(
				"451 restricted location"
			);
		});

		it("should use default options when not provided", async () => {
			await source.fetchSnapshot({ symbol: ETH });

			expect(MOCK_RECENT_TRADES).toHaveBeenCalledWith(
				{
					symbol: ETH,
					limit: LIMIT_100,
				},
				undefined
			);
			expect(MOCK_CANDLESTICK_DATA).toHaveBeenCalledWith(
				{
					symbol: ETH,
					limit: LIMIT_100,
					interval: CandleInterval.Min1,
				},
				undefined
			);
		});
	});
});
