import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/common/middleware/catch-error", () => ({
	catchSync: (fn: (...args: unknown[]) => unknown) => fn,
}));

jest.mock("@trading-model/common/middleware/response-exception", () => ({
	sendResponse: (data: any, status: number) => ({ status, data }),
	ResponseException: (reason: string) => ({
		BadRequest: () => {
			throw new Error(JSON.stringify({ status: 400, data: reason }));
		},
		Success: () => {
			throw new Error(JSON.stringify({ status: 200, data: reason }));
		},
		NotFound: () => {
			throw new Error(JSON.stringify({ status: 404, data: reason }));
		},
	}),
}));

const MOCK_SELECT_TRADES_BY = {
	symbol: jest.fn<any>(),
	timestamp: jest.fn<any>(),
	source: jest.fn<any>(),
};

const MOCK_SELECT_TICKER_BY = {
	symbol: jest.fn<any>(),
	timestamp: jest.fn<any>(),
	source: jest.fn<any>(),
};

const MOCK_SELECT_ORDER_BOOK_BY = {
	symbol: jest.fn<any>(),
	source: jest.fn<any>(),
	timestamp: {
		after: jest.fn<any>(),
		before: jest.fn<any>(),
	},
};

const MOCK_SELECT_CANDLES_BY = {
	symbol: jest.fn<any>(),
	source: jest.fn<any>(),
	timestamp: {
		after: jest.fn<any>(),
	},
};

jest.mock("infra/market-data/schema/trades.schema", () => ({
	selectTradesBy: MOCK_SELECT_TRADES_BY,
}));

jest.mock("infra/market-data/schema/ticker24h.schema", () => ({
	selectTickerBy: MOCK_SELECT_TICKER_BY,
}));

jest.mock("infra/market-data/schema/order-book.schema", () => ({
	selectOrderBookBy: MOCK_SELECT_ORDER_BOOK_BY,
}));

jest.mock("infra/market-data/schema/candles-schema", () => ({
	selectCandlesBy: MOCK_SELECT_CANDLES_BY,
}));

import {
	GET_CANDLES_BY_SOURCE_CONTROLLER,
	GET_CANDLES_BY_SYMBOL_CONTROLLER,
	GET_CANDLES_BY_TIMESTAMP_CONTROLLER,
	GET_ORDER_BOOK_BY_SOURCE_CONTROLLER,
	GET_ORDER_BOOK_BY_SYMBOL_CONTROLLER,
	GET_ORDER_BOOK_BY_TIMESTAMP_AFTER_CONTROLLER,
	GET_ORDER_BOOK_BY_TIMESTAMP_BEFORE_CONTROLLER,
	GET_TICKER_BY_SOURCE_CONTROLLER,
	GET_TICKER_BY_SYMBOL_CONTROLLER,
	GET_TICKER_BY_TIMESTAMP_CONTROLLER,
	GET_TRADE_BY_SOURCE_CONTROLLER,
	GET_TRADE_BY_SYMBOL_CONTROLLER,
	GET_TRADE_BY_TIMESTAMP_CONTROLLER,
} from "../../../../src/clients/http/controller";

describe("HTTP Controllers", () => {
	const mockReq = (params: Record<string, any>) => ({ params }) as any;
	const mockRes = {} as any;
	const mockNext = jest.fn();

	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("Trade controllers", () => {
		beforeEach(() => {
			MOCK_SELECT_TRADES_BY.symbol.mockResolvedValue([{ tradeId: 1 }]);
			MOCK_SELECT_TRADES_BY.timestamp.mockResolvedValue([{ tradeId: 2 }]);
			MOCK_SELECT_TRADES_BY.source.mockResolvedValue([{ tradeId: 3 }]);
		});

		it("GET_TRADE_BY_SYMBOL_CONTROLLER should call selectTradesBy.symbol with valid symbol", async () => {
			const result = await GET_TRADE_BY_SYMBOL_CONTROLLER(
				mockReq({ symbol: "BTCUSDT" }),
				mockRes,
				mockNext
			);
			expect(result).toMatchObject({ status: 200 });
			expect(MOCK_SELECT_TRADES_BY.symbol).toHaveBeenCalledWith("BTCUSDT");
		});

		it("GET_TRADE_BY_SYMBOL_CONTROLLER should throw BadRequest with missing symbol", async () => {
			const result = await GET_TRADE_BY_SYMBOL_CONTROLLER(
				mockReq({}),
				mockRes,
				mockNext
			);
			expect(result).toMatchObject({ status: 400 });
		});

		it("GET_TRADE_BY_TIMESTAMP_CONTROLLER should call selectTradesBy.timestamp with valid date", async () => {
			const result = await GET_TRADE_BY_TIMESTAMP_CONTROLLER(
				mockReq({ timestamp: "2024-01-01" }),
				mockRes,
				mockNext
			);
			expect(result).toMatchObject({ status: 200 });
			expect(MOCK_SELECT_TRADES_BY.timestamp).toHaveBeenCalled();
		});

		it("GET_TRADE_BY_TIMESTAMP_CONTROLLER should throw BadRequest with invalid timestamp", async () => {
			const result = await GET_TRADE_BY_TIMESTAMP_CONTROLLER(
				mockReq({ timestamp: "" }),
				mockRes,
				mockNext
			);
			expect(result).toMatchObject({ status: 400 });
		});

		it("GET_TRADE_BY_SOURCE_CONTROLLER should call selectTradesBy.source with valid source", async () => {
			const result = await GET_TRADE_BY_SOURCE_CONTROLLER(
				mockReq({ source: "binance" }),
				mockRes,
				mockNext
			);
			expect(result).toMatchObject({ status: 200 });
			expect(MOCK_SELECT_TRADES_BY.source).toHaveBeenCalledWith("binance");
		});

		it("GET_TRADE_BY_SOURCE_CONTROLLER should throw BadRequest with missing source", async () => {
			const result = await GET_TRADE_BY_SOURCE_CONTROLLER(
				mockReq({}),
				mockRes,
				mockNext
			);
			expect(result).toMatchObject({ status: 400 });
		});

		it("should throw NotFound when fetcher returns no result", async () => {
			MOCK_SELECT_TRADES_BY.symbol.mockRejectedValue(
				new Error("No result returned")
			);
			const result = await GET_TRADE_BY_SYMBOL_CONTROLLER(
				mockReq({ symbol: "UNKNOWN" }),
				mockRes,
				mockNext
			);
			expect(result).toMatchObject({ status: 404 });
		});

		it("should rethrow unexpected errors from fetcher", async () => {
			MOCK_SELECT_TRADES_BY.symbol.mockRejectedValue(
				new Error("Database connection failed")
			);
			await expect(
				GET_TRADE_BY_SYMBOL_CONTROLLER(
					mockReq({ symbol: "BTCUSDT" }),
					mockRes,
					mockNext
				)
			).rejects.toThrow("Database connection failed");
		});

		it("should wrap non-Error rejections from fetcher as Error", async () => {
			MOCK_SELECT_TRADES_BY.symbol.mockRejectedValue("plain string error");
			await expect(
				GET_TRADE_BY_SYMBOL_CONTROLLER(
					mockReq({ symbol: "BTCUSDT" }),
					mockRes,
					mockNext
				)
			).rejects.toThrow("plain string error");
		});
	});

	describe("Ticker controllers", () => {
		beforeEach(() => {
			MOCK_SELECT_TICKER_BY.symbol.mockResolvedValue([{ symbol: "BTCUSDT" }]);
			MOCK_SELECT_TICKER_BY.timestamp.mockResolvedValue([
				{ symbol: "BTCUSDT" },
			]);
			MOCK_SELECT_TICKER_BY.source.mockResolvedValue([{ symbol: "BTCUSDT" }]);
		});

		it("GET_TICKER_BY_SYMBOL_CONTROLLER should call selectTickerBy.symbol", async () => {
			const result = await GET_TICKER_BY_SYMBOL_CONTROLLER(
				mockReq({ symbol: "BTCUSDT" }),
				mockRes,
				mockNext
			);
			expect(result).toMatchObject({ status: 200 });
			expect(MOCK_SELECT_TICKER_BY.symbol).toHaveBeenCalledWith("BTCUSDT");
		});

		it("GET_TICKER_BY_TIMESTAMP_CONTROLLER should call selectTickerBy.timestamp", async () => {
			const result = await GET_TICKER_BY_TIMESTAMP_CONTROLLER(
				mockReq({ timestamp: "2024-01-01" }),
				mockRes,
				mockNext
			);
			expect(result).toMatchObject({ status: 200 });
			expect(MOCK_SELECT_TICKER_BY.timestamp).toHaveBeenCalled();
		});

		it("GET_TICKER_BY_SOURCE_CONTROLLER should call selectTickerBy.source", async () => {
			const result = await GET_TICKER_BY_SOURCE_CONTROLLER(
				mockReq({ source: "binance" }),
				mockRes,
				mockNext
			);
			expect(result).toMatchObject({ status: 200 });
			expect(MOCK_SELECT_TICKER_BY.source).toHaveBeenCalledWith("binance");
		});
	});

	describe("OrderBook controllers", () => {
		beforeEach(() => {
			MOCK_SELECT_ORDER_BOOK_BY.symbol.mockResolvedValue([
				{ symbol: "BTCUSDT" },
			]);
			MOCK_SELECT_ORDER_BOOK_BY.source.mockResolvedValue([
				{ symbol: "BTCUSDT" },
			]);
			MOCK_SELECT_ORDER_BOOK_BY.timestamp.after.mockResolvedValue([
				{ symbol: "BTCUSDT" },
			]);
			MOCK_SELECT_ORDER_BOOK_BY.timestamp.before.mockResolvedValue([
				{ symbol: "BTCUSDT" },
			]);
		});

		it("GET_ORDER_BOOK_BY_SYMBOL_CONTROLLER should call selectOrderBookBy.symbol", async () => {
			const result = await GET_ORDER_BOOK_BY_SYMBOL_CONTROLLER(
				mockReq({ symbol: "BTCUSDT" }),
				mockRes,
				mockNext
			);
			expect(result).toMatchObject({ status: 200 });
			expect(MOCK_SELECT_ORDER_BOOK_BY.symbol).toHaveBeenCalledWith("BTCUSDT");
		});

		it("GET_ORDER_BOOK_BY_TIMESTAMP_AFTER_CONTROLLER should call selectOrderBookBy.timestamp.after", async () => {
			const result = await GET_ORDER_BOOK_BY_TIMESTAMP_AFTER_CONTROLLER(
				mockReq({ timestamp: "1000" }),
				mockRes,
				mockNext
			);
			expect(result).toMatchObject({ status: 200 });
			expect(MOCK_SELECT_ORDER_BOOK_BY.timestamp.after).toHaveBeenCalledWith(
				1000
			);
		});

		it("GET_ORDER_BOOK_BY_TIMESTAMP_BEFORE_CONTROLLER should call selectOrderBookBy.timestamp.before", async () => {
			const result = await GET_ORDER_BOOK_BY_TIMESTAMP_BEFORE_CONTROLLER(
				mockReq({ timestamp: "9999" }),
				mockRes,
				mockNext
			);
			expect(result).toMatchObject({ status: 200 });
			expect(MOCK_SELECT_ORDER_BOOK_BY.timestamp.before).toHaveBeenCalledWith(
				9999
			);
		});

		it("GET_ORDER_BOOK_BY_SOURCE_CONTROLLER should call selectOrderBookBy.source", async () => {
			const result = await GET_ORDER_BOOK_BY_SOURCE_CONTROLLER(
				mockReq({ source: "binance" }),
				mockRes,
				mockNext
			);
			expect(result).toMatchObject({ status: 200 });
			expect(MOCK_SELECT_ORDER_BOOK_BY.source).toHaveBeenCalledWith("binance");
		});

		it("should throw BadRequest for invalid order book timestamp", async () => {
			const result = await GET_ORDER_BOOK_BY_TIMESTAMP_AFTER_CONTROLLER(
				mockReq({ timestamp: "not-a-number" }),
				mockRes,
				mockNext
			);
			expect(result).toMatchObject({ status: 400 });
		});
	});

	describe("Candles controllers", () => {
		beforeEach(() => {
			MOCK_SELECT_CANDLES_BY.symbol.mockResolvedValue([{ symbol: "BTCUSDT" }]);
			MOCK_SELECT_CANDLES_BY.source.mockResolvedValue([{ symbol: "BTCUSDT" }]);
			MOCK_SELECT_CANDLES_BY.timestamp.after.mockResolvedValue([
				{ symbol: "BTCUSDT" },
			]);
		});

		it("GET_CANDLES_BY_SYMBOL_CONTROLLER should call selectCandlesBy.symbol", async () => {
			const result = await GET_CANDLES_BY_SYMBOL_CONTROLLER(
				mockReq({ symbol: "BTCUSDT" }),
				mockRes,
				mockNext
			);
			expect(result).toMatchObject({ status: 200 });
			expect(MOCK_SELECT_CANDLES_BY.symbol).toHaveBeenCalledWith("BTCUSDT");
		});

		it("GET_CANDLES_BY_TIMESTAMP_CONTROLLER should call selectCandlesBy.timestamp.after", async () => {
			const result = await GET_CANDLES_BY_TIMESTAMP_CONTROLLER(
				mockReq({ timestamp: "2024-01-01" }),
				mockRes,
				mockNext
			);
			expect(result).toMatchObject({ status: 200 });
			expect(MOCK_SELECT_CANDLES_BY.timestamp.after).toHaveBeenCalled();
		});

		it("GET_CANDLES_BY_SOURCE_CONTROLLER should call selectCandlesBy.source", async () => {
			const result = await GET_CANDLES_BY_SOURCE_CONTROLLER(
				mockReq({ source: "binance" }),
				mockRes,
				mockNext
			);
			expect(result).toMatchObject({ status: 200 });
			expect(MOCK_SELECT_CANDLES_BY.source).toHaveBeenCalledWith("binance");
		});
	});
});
