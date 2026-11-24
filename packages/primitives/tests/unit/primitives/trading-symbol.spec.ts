import { describe, expect, it } from "@jest/globals";
import { TradingSymbol } from "../../../src/primitives/trading-symbol";

describe("TradingSymbol", () => {
	it("should create a valid trading symbol", () => {
		expect(TradingSymbol.of("BTCUSDT")).toBe("BTCUSDT");
	});

	it("should throw for empty string", () => {
		expect(() => TradingSymbol.of("")).toThrow(RangeError);
	});
});
