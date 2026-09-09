import { toPaginatedResponse } from "../src/shared/contracts/pagination.types";

describe("toPaginatedResponse", () => {
	it("converts a pagination result correctly", () => {
		const result = toPaginatedResponse({
			docs: [{ id: 1 }, { id: 2 }],
			page: 1,
			limit: 10,
			total: 25,
		});

		expect(result).toEqual({
			data: [{ id: 1 }, { id: 2 }],
			pagination: {
				page: 1,
				limit: 10,
				total: 25,
				totalPages: 3,
			},
		});
	});

	it("handles zero total", () => {
		const result = toPaginatedResponse({
			docs: [],
			page: 1,
			limit: 10,
			total: 0,
		});

		expect(result.pagination.totalPages).toBe(0);
	});

	it("handles exact division", () => {
		const result = toPaginatedResponse({
			docs: [],
			page: 1,
			limit: 5,
			total: 20,
		});

		expect(result.pagination.totalPages).toBe(4);
	});

	it("handles single page", () => {
		const result = toPaginatedResponse({
			docs: [{ id: 1 }],
			page: 1,
			limit: 10,
			total: 1,
		});

		expect(result.pagination.totalPages).toBe(1);
	});
});
