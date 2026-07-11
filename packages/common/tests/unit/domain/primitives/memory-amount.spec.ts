import { describe, expect, it } from "@jest/globals";
import { MemoryAmount } from "../../../../src/domain/primitives/memory-amount";

describe("MemoryAmount", () => {
	it("should create a valid memory amount", () => {
		expect(MemoryAmount.of(1024)).toBe(1024);
		expect(MemoryAmount.of(0)).toBe(0);
	});

	it("should throw for negative values", () => {
		expect(() => MemoryAmount.of(-1)).toThrow(RangeError);
	});

	it("should throw for non-finite values", () => {
		expect(() => MemoryAmount.of(Number.POSITIVE_INFINITY)).toThrow(RangeError);
		expect(() => MemoryAmount.of(Number.NaN)).toThrow(RangeError);
	});

	it("should return zero", () => {
		expect(MemoryAmount.zero()).toBe(0);
	});

	it("should add and subtract", () => {
		expect(MemoryAmount.add(10 as never, 20 as never)).toBe(30);
		expect(MemoryAmount.sub(20 as never, 10 as never)).toBe(10);
	});

	it("should compare", () => {
		expect(MemoryAmount.gt(20 as never, 10 as never)).toBe(true);
		expect(MemoryAmount.lt(10 as never, 20 as never)).toBe(true);
	});

	it("should convert to number", () => {
		expect(MemoryAmount.toNumber(512 as never)).toBe(512);
	});
});
