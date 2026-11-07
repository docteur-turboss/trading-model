import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import type { Response } from "express";
import { pingController } from "../../src/adapters/inbound/ping.controller";

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
		pingController({} as any, mockRes as Response);
		expect(mockRes.status).toHaveBeenCalledWith(201);
		expect(mockRes.json).toHaveBeenCalledWith("pong");
	});
});
