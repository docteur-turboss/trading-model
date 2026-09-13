import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { catchSync } from "@trading-model/http/adapters/inbound/catch-error";
import { handleCoreResponse } from "@trading-model/http/adapters/inbound/handle-core-response";
import { ResponseException } from "@trading-model/http/adapters/inbound/response-exception";

describe("Middleware chain integration", () => {
	let req: any;
	let res: any;
	let next: jest.Mock;

	beforeEach(() => {
		req = {};
		res = {
			status: jest.fn().mockReturnThis(),
			json: jest.fn().mockReturnThis(),
			cookie: jest.fn().mockReturnThis(),
		};
		next = jest.fn();
	});

	it("should handle a full success flow with catchSync + handleCoreResponse", async () => {
		const handler = catchSync(async (_req: any, _res: any) => {
			const coreFn: () => Promise<{ data: unknown; code: string }> =
				async () => ({ data: "user-data", code: "success" });
			await handleCoreResponse(coreFn, _res);
		});

		await handler(req, res, next);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({ status: 200, data: "user-data" })
		);
		expect(next).not.toHaveBeenCalled();
	});

	it("should handle errors through catchSync", async () => {
		const handler = catchSync((_req: any, _res: any, _next: any) => {
			throw new Error("Something broke");
		});

		await handler(req, res, next);

		expect(next).toHaveBeenCalledWith(new Error("Something broke"));
	});

	it("should work with ResponseException factory", () => {
		const response = ResponseException("not found").notFound();
		expect(response.status).toBe(404);

		res.status(response.status).json(response.data);
		expect(res.status).toHaveBeenCalledWith(404);
		expect(res.json).toHaveBeenCalledWith("not found");
	});

	it("should flow from core error to standardized response", async () => {
		const handler = catchSync((_req: any, _res: any, _next: any) => {
			throw ResponseException("Bad input").badRequest();
		});

		await handler(req, res, next);

		const error = next.mock.calls[0]?.[0];
		expect(error).toBeDefined();
	});
});
