import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { CandleInterval } from "@trading-model/common/config/event.types";
import { toSymbol } from "@trading-model/common/domain/primitives";

jest.mock("../../../../src/clients/binance/binance.client", () => ({
	getOrderBook: jest.fn(),
	getCandlestickData: jest.fn(),
	getRecentTrades: jest.fn(),
	getOrderBookTicker: jest.fn(),
	get24hrTickerStats: jest.fn(),
	getSymbolPriceTicker: jest.fn(),
}));

jest.mock("../../../../src/clients/binance/normalizer", () => ({
	BinanceNormalizer: {
		orderBook: jest.fn(),
		trades: jest.fn(),
		candles: jest.fn(),
		ticker24h: jest.fn(),
		priceTicker: jest.fn(),
		bookTicker: jest.fn(),
	},
}));

jest.mock("../../../../src/config/message-manager", () => ({
	MessageManager: {
		post: {
			indirect: jest.fn(),
		},
	},
}));

const MOCK_METADATA_BUILDER_CTOR = jest.fn(() => ({
	setDelivery: jest.fn().mockReturnThis(),
	setEventType: jest.fn().mockReturnThis(),
	setTopic: jest.fn().mockReturnThis(),
	setSecurity: jest.fn().mockReturnThis(),
	setIds: jest.fn().mockReturnThis(),
	setPublisher: jest.fn().mockReturnThis(),
	toJSON: jest.fn().mockReturnValue({}),
}));

jest.mock("@trading-model/broker-message", () => ({
	HELPER: {
		metadataBuilder: MOCK_METADATA_BUILDER_CTOR,
	},
}));

jest.mock("../../../../src/config/env", () => ({
	ENV: {
		SERVICE_NAME: "financial-scraper-service",
		INSTANCE_ID: "test-instance-1",
	},
}));

jest.mock("uuid", () => ({
	v4: () => "00000000-0000-0000-0000-000000000000",
}));

import * as binanceClient from "../../../../src/clients/binance/binance.client";
import { BinanceNormalizer } from "../../../../src/clients/binance/normalizer";
import { MessageManager } from "../../../../src/config/message-manager";
import { BinanceWorker } from "../../../../src/job/worker/binance.worker";

const BTC = toSymbol("BTCUSDT");
const ETH = toSymbol("ETHUSDT");

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

const MOCK_MESSAGE_MANAGER_INDIRECT = jest.mocked(MessageManager.post.indirect);

describe("BinanceWorker", () => {
	let worker: BinanceWorker;

	const mockNormalized = {
		orderBook: { symbol: BTC },
		recentTrades: [{ tradeId: 1 }],
		candles: [{ symbol: BTC, interval: CandleInterval.MIN1 }],
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

		worker = new BinanceWorker({
			symbol: BTC,
			interval: CandleInterval.MIN1,
			candleLimit: 50,
			tradeLimit: 50,
			orderBookLimit: 10,
		});
	});

	describe("run", () => {
		it("should call all 6 Binance client functions in parallel", async () => {
			await worker.run();

			expect(MOCK_GET_ORDER_BOOK).toHaveBeenCalledWith({
				symbol: BTC,
				limit: 10,
			});
			expect(MOCK_RECENT_TRADES).toHaveBeenCalledWith({
				symbol: BTC,
				limit: 50,
			});
			expect(MOCK_CANDLESTICK_DATA).toHaveBeenCalledWith({
				symbol: BTC,
				limit: 50,
				interval: CandleInterval.MIN1,
			});
			expect(MOCK24HR_TICKER_STATS).toHaveBeenCalledWith([BTC]);
			expect(MOCK_SYMBOL_PRICE_TICKER).toHaveBeenCalledWith([BTC]);
			expect(MOCK_ORDER_BOOK_TICKER).toHaveBeenCalledWith([BTC]);
		});

		it("should normalize all raw responses", async () => {
			await worker.run();

			expect(MOCK_NORMALIZER_ORDER_BOOK).toHaveBeenCalled();
			expect(MOCK_NORMALIZER_TRADES).toHaveBeenCalled();
			expect(MOCK_NORMALIZER_CANDLES).toHaveBeenCalled();
			expect(MOCK_NORMALIZER_TICKER24H).toHaveBeenCalled();
			expect(MOCK_NORMALIZER_PRICE_TICKER).toHaveBeenCalled();
			expect(MOCK_NORMALIZER_BOOK_TICKER).toHaveBeenCalled();
		});

		it("should return normalized result with fetchedAt", async () => {
			const result = await worker.run();

			expect(result.orderBook).toEqual(mockNormalized.orderBook);
			expect(result.recentTrades).toEqual(mockNormalized.recentTrades);
			expect(result.candles).toEqual(mockNormalized.candles);
			expect(result.ticker24h).toEqual(mockNormalized.ticker24h);
			expect(result.priceTicker).toEqual(mockNormalized.priceTicker);
			expect(result.bookTicker).toEqual(mockNormalized.bookTicker);
			expect(typeof result.fetchedAt).toBe("number");
		});

		it("should publish 6 messages via MessageManager", async () => {
			await worker.run();

			expect(MOCK_MESSAGE_MANAGER_INDIRECT).toHaveBeenCalledTimes(6);
		});

		it("should use default options when not provided", async () => {
			const defaultWorker = new BinanceWorker({ symbol: ETH });
			await defaultWorker.run();

			expect(MOCK_RECENT_TRADES).toHaveBeenCalledWith({
				symbol: ETH,
				limit: 100,
			});
			expect(MOCK_CANDLESTICK_DATA).toHaveBeenCalledWith({
				symbol: ETH,
				limit: 100,
				interval: CandleInterval.MIN1,
			});
		});

		it("should create a fresh MetadataBuilder per invocation (not shared singleton)", async () => {
			const callCountBefore = MOCK_METADATA_BUILDER_CTOR.mock.calls.length;
			await worker.run();
			expect(MOCK_METADATA_BUILDER_CTOR.mock.calls.length).toBe(
				callCountBefore + 1
			);
		});
	});
});
