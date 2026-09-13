import { describe, expect, it } from "@jest/globals";
import { BinanceFromId } from "../../../../src/domain/primitives/binance-ids";

describe("BinanceFromId", () => {
	it("should create a valid id", () => {
		expect(BinanceFromId.of("12345")).toBe("12345");
	});

	it("should throw for empty strings", () => {
		expect(() => BinanceFromId.of("")).toThrow(
			"BinanceFromId must be a non-empty string"
		);
	});
});
