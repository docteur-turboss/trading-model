import { describe, expect, it } from "@jest/globals";
import {
	CandleInterval,
	MarketType,
	SourceType,
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

	it("should list all values", () => {
		const values = CandleInterval.values();
		expect(values).toContain(CandleInterval.Min1);
	});

	it("should give the length of a bar in ms", () => {
		expect(CandleInterval.toMs(CandleInterval.Min1)).toBe(60_000);
		expect(CandleInterval.toMs(CandleInterval.D1)).toBe(86_400_000);
	});
});
