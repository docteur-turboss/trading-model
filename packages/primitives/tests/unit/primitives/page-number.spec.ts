import { describe, expect, it } from "@jest/globals";
import { Limit, PageNumber } from "../../../src/primitives/page-number";

describe("PageNumber", () => {
	it("should create a valid page number", () => {
		expect(PageNumber.of(1)).toBe(1);
		expect(PageNumber.of(5)).toBe(5);
	});

	it("should clamp to minimum 1", () => {
		expect(PageNumber.of(0)).toBe(1);
		expect(PageNumber.of(-5)).toBe(1);
	});

	it("should round non-integer values", () => {
		expect(PageNumber.of(2.7)).toBe(3);
	});
});

describe("Limit", () => {
	it("should create within bounds", () => {
		expect(Limit.of(10, 100)).toBe(10);
	});

	it("should clamp to max", () => {
		expect(Limit.of(200, 100)).toBe(100);
	});

	it("should clamp to minimum 1", () => {
		expect(Limit.of(0, 100)).toBe(1);
	});

	it("should round non-integer values", () => {
		expect(Limit.of(2.7, 100)).toBe(3);
	});
});
