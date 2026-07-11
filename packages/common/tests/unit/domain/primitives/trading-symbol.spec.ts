import { describe, expect, it } from "@jest/globals";
import {
	fromSymbol,
	TradingSymbol,
	toSymbol,
} from "../../../../src/domain/primitives/trading-symbol";

describe("TradingSymbol", () => {
	it("should create a valid trading symbol", () => {
		expect(TradingSymbol.of("BTCUSDT")).toBe("BTCUSDT");
	});

	it("should throw for empty string", () => {
		expect(() => TradingSymbol.of("")).toThrow(RangeError);
	});

	it("should convert via toSymbol and fromSymbol", () => {
		expect(toSymbol("ETHUSDT")).toBe("ETHUSDT");
		expect(fromSymbol("ETHUSDT" as never)).toBe("ETHUSDT");
	});
});
