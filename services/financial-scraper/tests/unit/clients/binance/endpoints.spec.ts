import { describe, expect, it } from "@jest/globals";
import { CandleInterval } from "@trading-model/common/config/event.types";
import { toSymbol } from "@trading-model/common/domain/primitives";
import { BINANCE_ENDPOINTS } from "../../../../src/clients/binance/endpoints";

const BTC = toSymbol("BTCUSDT");
const ETH = toSymbol("ETHUSDT");

describe("BINANCE_ENDPOINTS", () => {
	describe("depth", () => {
		it("should build order book URL with limit and symbol", () => {
			const url = BINANCE_ENDPOINTS.depth({ symbol: BTC, limit: 100 });
			expect(url).toBe("/api/v3/depth?symbol=BTCUSDT&limit=100");
		});

		it("should build order book URL without params", () => {
			const url = BINANCE_ENDPOINTS.depth();
			expect(url).toBe("/api/v3/depth");
		});
	});

	describe("trades", () => {
		it("should build recent trades URL with limit and symbol", () => {
			const url = BINANCE_ENDPOINTS.trades({ symbol: ETH, limit: 500 });
			expect(url).toBe("/api/v3/trades?symbol=ETHUSDT&limit=500");
		});

		it("should build recent trades URL without params", () => {
			const url = BINANCE_ENDPOINTS.trades();
			expect(url).toBe("/api/v3/trades");
		});
	});

	describe("historicalTrades", () => {
		it("should build historical trades URL with all params", () => {
			const url = BINANCE_ENDPOINTS.historicalTrades({
				symbol: BTC,
				limit: 500,
				fromId: 12345,
			});
			expect(url).toBe(
				"/api/v3/historicalTrades?symbol=BTCUSDT&limit=500&fromId=12345"
			);
		});

		it("should build historical trades URL without params", () => {
			const url = BINANCE_ENDPOINTS.historicalTrades();
			expect(url).toBe("/api/v3/historicalTrades");
		});
	});

	describe("candlesticks", () => {
		it("should build candlestick URL with all params", () => {
			const url = BINANCE_ENDPOINTS.candlesticks({
				symbol: BTC,
				interval: CandleInterval.MIN1,
				startTime:
					1620000000000 as unknown as import("@trading-model/common/domain/primitives").UnixTimestamp,
				limit: 100,
			});
			expect(url).toBe(
				"/api/v3/klines?symbol=BTCUSDT&interval=1m&startTime=1620000000000&limit=100"
			);
		});

		it("should build candlestick URL without params", () => {
			const url = BINANCE_ENDPOINTS.candlesticks();
			expect(url).toBe("/api/v3/klines");
		});
	});

	describe("change24hrStats", () => {
		it("should build 24hr stats URL with symbols", () => {
			const url = BINANCE_ENDPOINTS.change24hrStats(["BTCUSDT"]);
			expect(url).toContain("/api/v3/ticker/24hr?symbols=");
			expect(url).toContain("BTCUSDT");
		});

		it("should build 24hr stats URL without symbols", () => {
			const url = BINANCE_ENDPOINTS.change24hrStats();
			expect(url).toBe("/api/v3/ticker/24hr");
		});
	});

	describe("compressedAggregateTrades", () => {
		it("should build aggTrades URL with all params", () => {
			const url = BINANCE_ENDPOINTS.compressedAggregateTrades({
				symbol: BTC,
				fromId: 12345,
				limit: 100,
			});
			expect(url).toBe(
				"/api/v3/aggTrades?symbol=BTCUSDT&fromId=12345&limit=100"
			);
		});

		it("should build aggTrades URL without params", () => {
			const url = BINANCE_ENDPOINTS.compressedAggregateTrades();
			expect(url).toBe("/api/v3/aggTrades");
		});
	});

	describe("tradingDayTicker", () => {
		it("should build trading day ticker URL with symbols", () => {
			const url = BINANCE_ENDPOINTS.tradingDayTicker(["BTCUSDT", "ETHUSDT"]);
			expect(url).toContain("/api/v3/ticker/tradingDay?symbols=");
			expect(url).toContain("BTCUSDT");
			expect(url).toContain("ETHUSDT");
		});

		it("should build trading day ticker URL without symbols", () => {
			const url = BINANCE_ENDPOINTS.tradingDayTicker();
			expect(url).toBe("/api/v3/ticker/tradingDay");
		});
	});

	describe("symbolPriceTicker", () => {
		it("should build price ticker URL with symbols", () => {
			const url = BINANCE_ENDPOINTS.symbolPriceTicker(["BTCUSDT"]);
			expect(url).toContain("/api/v3/ticker/price?symbols=");
		});

		it("should build price ticker URL without symbols", () => {
			const url = BINANCE_ENDPOINTS.symbolPriceTicker();
			expect(url).toBe("/api/v3/ticker/price");
		});
	});

	describe("orderBookTicker", () => {
		it("should build book ticker URL with symbols", () => {
			const url = BINANCE_ENDPOINTS.orderBookTicker(["BTCUSDT"]);
			expect(url).toContain("/api/v3/ticker/bookTicker?symbols=");
		});

		it("should build book ticker URL without symbols", () => {
			const url = BINANCE_ENDPOINTS.orderBookTicker();
			expect(url).toBe("/api/v3/ticker/bookTicker");
		});
	});
});
