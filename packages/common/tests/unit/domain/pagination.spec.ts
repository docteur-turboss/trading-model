import { describe, expect, it } from "@jest/globals";
import { computePagination } from "../../../src/domain/pagination";

describe("computePagination", () => {
	it("should use defaults for empty query", () => {
		const result = computePagination({});
		expect(result.page).toBe(1);
		expect(result.limit).toBe(50);
		expect(result.skip).toBe(0);
	});

	it("should accept custom page and limit", () => {
		const result = computePagination({ page: 3 as never, limit: 20 as never });
		expect(result.page).toBe(3);
		expect(result.limit).toBe(20);
		expect(result.skip).toBe(40);
	});

	it("should cap limit at maxLimit", () => {
		const result = computePagination({ limit: 5000 as never }, 50, 100);
		expect(result.limit).toBe(100);
	});

	it("should accept custom defaultLimit", () => {
		const result = computePagination({}, 25);
		expect(result.limit).toBe(25);
	});

	it("should handle page 0 gracefully", () => {
		const result = computePagination({ page: 0 as never });
		expect(result.page).toBe(1);
	});

	it("should compute skip correctly", () => {
		const result = computePagination({ page: 3 as never, limit: 10 as never });
		expect(result.skip).toBe(20);
	});
});
