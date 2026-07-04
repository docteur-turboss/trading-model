import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../src/controllers/crl.controller", () => ({
	getCrl: jest.fn(),
}));

import { Router } from "express";
import { crlRoutes } from "../../src/routes/crl.routes";

describe("crlRoutes", () => {
	it("should return a router with GET /crl", () => {
		const router = crlRoutes();

		expect(router).toBeInstanceOf(Router);
	});
});
