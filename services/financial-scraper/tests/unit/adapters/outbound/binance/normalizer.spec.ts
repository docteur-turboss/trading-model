import { describe, expect, it } from "@jest/globals";
import { CandleInterval } from "@trading-model/contracts/market-data.types";
import {
	TradingSymbol,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import { normalizeCandles } from "../../../../../src/adapters/outbound/binance/normalizers/candles";
import { normalizeOrderBook } from "../../../../../src/adapters/outbound/binance/normalizers/order-book";
import { normalizeTicker24h } from "../../../../../src/adapters/outbound/binance/normalizers/ticker";
import {
	mock24hrTickerResponse,
	mockCandlestickResponse,
	mockDepthResponse,
} from "../../../../fixtures/binance.fixture";

const SYMBOL = TradingSymbol.of("BTCUSDT");

const SYMBOL_QUERY = { symbol: SYMBOL };

describe("Binance normalizers", () => {
	describe("orderBook", () => {
		it("should normalize depth response to OrderBookData", () => {
			const result = normalizeOrderBook(SYMBOL_QUERY, mockDepthResponse);
			expect(result.symbol).toBe("BTCUSDT");
			expect(result.source).toBe("binance");
			expect(result.market).toBe("crypto");
			expect(result.bids.size).toBe(2);
			expect(result.asks.size).toBe(2);
			expect(typeof result.timestamp).toBe("number");
		});

		it("should parse bid/ask prices as numbers", () => {
			const result = normalizeOrderBook(SYMBOL_QUERY, mockDepthResponse);
			const firstBid = [...result.bids][0];
			expect(typeof firstBid.price).toBe("number");
			expect(typeof firstBid.quantity).toBe("number");
		});
	});

	describe("candles", () => {
		it("should normalize candlestick response to CandleData array", () => {
			const result = normalizeCandles(
				{ symbol: SYMBOL, interval: CandleInterval.Min1 },
				mockCandlestickResponse
			);
			expect(result).toHaveLength(1);
			expect(result[0].symbol).toBe("BTCUSDT");
			expect(result[0].interval).toBe(CandleInterval.Min1);
			expect(result[0].open).toBe(0.0163479);
			expect(result[0].high).toBe(0.8);
			expect(result[0].low).toBe(0.015758);
			expect(result[0].close).toBe(0.015771);
			expect(result[0].volume).toBe(148976.11427815);
			expect(result[0].closeTimestamp).toBe(1499644799999);
			expect(result[0].trades).toBe(308);
			expect(result[0].timestamp).toBe(1499040000000);
		});

		it("should drop candles with empty or inconsistent prices, keep the others", () => {
			const good = mockCandlestickResponse[0];
			const result = normalizeCandles(
				{ symbol: SYMBOL, interval: CandleInterval.Min1 },
				[
					good,
					{ ...good, high: "0.001" as any },
					{ ...good, open: "" as any },
					{ ...good, openTime: UnixTimestamp.of(1) },
				]
			);
			expect(result.map((c) => c.timestamp)).toEqual([good.openTime, 1]);
		});

		it("should keep a candle nobody traded in, with trades = 0", () => {
			const result = normalizeCandles(
				{ symbol: SYMBOL, interval: CandleInterval.Min1 },
				[{ ...mockCandlestickResponse[0], numberOfTrades: 0 }]
			);
			expect(result).toHaveLength(1);
			expect(result[0].trades).toBe(0);
		});
	});

	describe("ticker24h", () => {
		it("should normalize 24hr ticker response to TickerData array", () => {
			const result = normalizeTicker24h(mock24hrTickerResponse);
			expect(result).toHaveLength(1);
			expect(result[0].symbol).toBe("BTCUSDT");
			expect(result[0].open).toBe(99);
			expect(result[0].high).toBe(100);
			expect(result[0].low).toBe(0.1);
			expect(result[0].last).toBe(4.000002);
			expect(result[0].volume).toBe(8913.3);
		});
	});
});
