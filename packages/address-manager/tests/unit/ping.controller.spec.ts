import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { ResponseException } from "@trading-model/common/middleware/response-exception";
import type { Response } from "express";
import { pingController } from "../../src/http/ping.controller";

describe("pingController", () => {
	let mockRes: Partial<Response>;

	beforeEach(() => {
		mockRes = {
			status: jest.fn().mockReturnThis(),
			json: jest.fn().mockReturnThis(),
		} as Partial<Response>;

		jest.clearAllMocks();
	});

	test("should respond with OK and pong", () => {
		const result = ResponseException("pong").ok();
		expect(result).toEqual({ status: 201, data: "pong" });

		pingController({} as any, mockRes as Response);
		expect(mockRes.status).toHaveBeenCalledWith(201);
		expect(mockRes.json).toHaveBeenCalledWith("pong");
	});
});
