import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../src/controllers/health.controller", () => ({
	ping: jest.fn(),
	health: jest.fn(),
}));

import { Router } from "express";
import { healthRoutes } from "../../src/routes/health.routes";

describe("healthRoutes", () => {
	it("should return a router with GET /ping and GET /health", () => {
		const router = healthRoutes();

		expect(router).toBeInstanceOf(Router);
	});
});
