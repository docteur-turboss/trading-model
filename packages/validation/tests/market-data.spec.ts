import {
	CandleInterval,
	MarketType,
	SourceType,
	TradeSide,
} from "../src/contracts/market-data.types";

describe("MarketType", () => {
	describe("isDecentralized", () => {
		it("returns true for Crypto", () => {
			expect(MarketType.isDecentralized(MarketType.Crypto)).toBe(true);
		});

		it("returns false for non-crypto", () => {
			expect(MarketType.isDecentralized(MarketType.Equity)).toBe(false);
			expect(MarketType.isDecentralized(MarketType.Bond)).toBe(false);
			expect(MarketType.isDecentralized(MarketType.Etf)).toBe(false);
			expect(MarketType.isDecentralized(MarketType.Fx)).toBe(false);
			expect(MarketType.isDecentralized(MarketType.Future)).toBe(false);
		});
	});

	it("values() returns all market types", () => {
		const values = MarketType.values();
		expect(values).toContain(MarketType.Crypto);
		expect(values).toContain(MarketType.Equity);
		expect(values).toContain(MarketType.Bond);
		expect(values).toContain(MarketType.Etf);
		expect(values).toContain(MarketType.Fx);
		expect(values).toContain(MarketType.Future);
	});

	it("values() returns all market types", () => {
		const values = MarketType.values();
		expect(values).toContain(MarketType.Crypto);
		expect(values).toContain(MarketType.Equity);
	});
});

describe("SourceType", () => {
	it("values() returns all source types", () => {
		const values = SourceType.values();
		expect(values).toContain(SourceType.Bloomberg);
		expect(values).toContain(SourceType.Binance);
		expect(values).toContain(SourceType.Nyse);
	});
});

describe("CandleInterval", () => {
	describe("toMs", () => {
		it("returns correct milliseconds for each interval", () => {
			expect(CandleInterval.toMs(CandleInterval.S1)).toBe(1000);
			expect(CandleInterval.toMs(CandleInterval.Min1)).toBe(60000);
			expect(CandleInterval.toMs(CandleInterval.Min5)).toBe(300000);
			expect(CandleInterval.toMs(CandleInterval.H1)).toBe(3600000);
			expect(CandleInterval.toMs(CandleInterval.D1)).toBe(86400000);
			expect(CandleInterval.toMs(CandleInterval.W1)).toBe(604800000);
			expect(CandleInterval.toMs(CandleInterval.Month1)).toBe(2592000000);
		});
	});

	it("values() returns all intervals", () => {
		const values = CandleInterval.values();
		expect(values).toContain(CandleInterval.S1);
		expect(values).toContain(CandleInterval.Min1);
		expect(values).toContain(CandleInterval.H1);
		expect(values).toContain(CandleInterval.D1);
		expect(values).toContain(CandleInterval.W1);
		expect(values).toContain(CandleInterval.Month1);
	});
});

describe("TradeSide", () => {
	describe("inverse", () => {
		it("returns Sell for Buy", () => {
			expect(TradeSide.inverse(TradeSide.Buy)).toBe(TradeSide.Sell);
		});

		it("returns Buy for Sell", () => {
			expect(TradeSide.inverse(TradeSide.Sell)).toBe(TradeSide.Buy);
		});
	});

	it("values() returns both sides", () => {
		const values = TradeSide.values();
		expect(values).toContain(TradeSide.Buy);
		expect(values).toContain(TradeSide.Sell);
	});
});
