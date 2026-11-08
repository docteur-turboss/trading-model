import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { catchSync } from "@trading-model/http/adapters/inbound/catch-error";
import { ResponseException } from "@trading-model/http/adapters/inbound/response-exception";

describe("Middleware chain integration", () => {
	let req: any;
	let res: any;
	let next: jest.Mock<(...args: any[]) => any>;

	beforeEach(() => {
		req = {};
		res = {
			status: jest.fn<(...args: any[]) => any>().mockReturnThis(),
			json: jest.fn<(...args: any[]) => any>().mockReturnThis(),
			cookie: jest.fn<(...args: any[]) => any>().mockReturnThis(),
		};
		next = jest.fn<(...args: any[]) => any>();
	});

	it("should handle errors through catchSync", async () => {
		const handler = catchSync((_req: any, _res: any, _next: any) => {
			throw new Error("Something broke");
		});

		await handler(req, res, next);

		expect(next).toHaveBeenCalledWith(new Error("Something broke"));
	});

	it("should work with ResponseException factory", () => {
		const response = ResponseException("not found").forbidden();
		expect(response.status).toBe(403);

		res.status(response.status).json(response.data);
		expect(res.status).toHaveBeenCalledWith(403);
		expect(res.json).toHaveBeenCalledWith("not found");
	});

	it("should flow from core error to standardized response", async () => {
		const handler = catchSync((_req: any, _res: any, _next: any) => {
			throw ResponseException("Bad input").forbidden();
		});

		await handler(req, res, next);

		const error = next.mock.calls[0]?.[0];
		expect(error).toBeDefined();
	});
});
