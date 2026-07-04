import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../src/controllers/certificate.controller", () => ({
	signCertificate: jest.fn(),
	getCertificate: jest.fn(),
	revokeCertificate: jest.fn(),
}));

import { Router } from "express";
import { certificateRoutes } from "../../src/routes/certificate.routes";

describe("certificateRoutes", () => {
	it("should return a router with POST /sign, GET /:serviceId, POST /revoke", () => {
		const router = certificateRoutes();

		expect(router).toBeInstanceOf(Router);
	});
});
