import { describe, expect, it } from "@jest/globals";
import { toPaginatedResponse } from "@trading-model/validation/shared/contracts/pagination.types";

describe("toPaginatedResponse", () => {
	it("should create a paginated response from PaginationResult", () => {
		const result = toPaginatedResponse({
			docs: [1, 2, 3],
			total: 10,
			page: 1 as never,
			limit: 3 as never,
		});
		expect(result.data).toEqual([1, 2, 3]);
		expect(result.pagination.total).toBe(10);
		expect(result.pagination.page).toBe(1);
		expect(result.pagination.limit).toBe(3);
	});
});
