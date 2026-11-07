import { describe, expect, it } from "@jest/globals";
import {
	CandleInterval,
	MarketType,
	SourceType,
	TradeSide,
} from "@trading-model/contracts/market-data.types";

describe("MarketType", () => {
	it("should have correct enum values", () => {
		expect(MarketType.Crypto).toBe("crypto");
		expect(MarketType.Equity).toBe("equity");
	});

	it("should list all values", () => {
		const values = MarketType.values();
		expect(values).toContain(MarketType.Crypto);
	});
});

describe("SourceType", () => {
	it("should have correct enum values", () => {
		expect(SourceType.Binance).toBe("binance");
	});

	it("should list all values", () => {
		const values = SourceType.values();
		expect(values).toContain(SourceType.Binance);
	});
});

describe("CandleInterval", () => {
	it("should have correct enum values", () => {
		expect(CandleInterval.Min1).toBe("1m");
		expect(CandleInterval.H1).toBe("1h");
	});

	it("should convert to milliseconds", () => {
		expect(CandleInterval.toMs(CandleInterval.S1)).toBe(1000);
		expect(CandleInterval.toMs(CandleInterval.H1)).toBe(3600000);
		expect(CandleInterval.toMs(CandleInterval.Min1)).toBe(60000);
		expect(CandleInterval.toMs(CandleInterval.Min5)).toBe(300000);
		expect(CandleInterval.toMs(CandleInterval.D1)).toBe(86400000);
		expect(CandleInterval.toMs(CandleInterval.W1)).toBe(604800000);
		expect(CandleInterval.toMs(CandleInterval.Month1)).toBe(2592000000);
	});

	it("should list all values", () => {
		const values = CandleInterval.values();
		expect(values).toContain(CandleInterval.Min1);
	});
});

describe("TradeSide", () => {
	it("should have correct enum values", () => {
		expect(TradeSide.Buy).toBe("buy");
		expect(TradeSide.Sell).toBe("sell");
	});

	it("should list all values", () => {
		const values = TradeSide.values();
		expect(values).toContain(TradeSide.Buy);
	});
});
