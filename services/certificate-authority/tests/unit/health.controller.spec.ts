import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const MOCK_GET_CA_CERT_PEM = jest.fn();

jest.mock("../../src/app", () => ({
	CONTAINER: {
		ca: {
			getCaCertPem: MOCK_GET_CA_CERT_PEM,
		},
	},
}));

import { health } from "../../src/controllers/health.controller";

describe("health.controller", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("health", () => {
		it("should return 200 with CA info", () => {
			const json = jest.fn();
			const status = jest.fn(() => ({ json }));
			const req = {} as any;
			const res = { status } as any;

			MOCK_GET_CA_CERT_PEM.mockReturnValue(
				"-----BEGIN CERTIFICATE-----\nca-cert\n-----END CERTIFICATE-----"
			);

			health(req, res);

			expect(res.status).toHaveBeenCalledWith(200);
			expect(res.status().json).toHaveBeenCalledWith({
				status: "ok",
				caInitialized: true,
				caFingerprint: expect.any(String),
			});
		});

		it("should return null caFingerprint when no CA cert PEM", () => {
			const json = jest.fn();
			const status = jest.fn(() => ({ json }));
			const req = {} as any;
			const res = { status } as any;

			MOCK_GET_CA_CERT_PEM.mockReturnValue("");

			health(req, res);

			expect(res.status).toHaveBeenCalledWith(200);
			expect(res.status().json).toHaveBeenCalledWith({
				status: "ok",
				caInitialized: true,
				caFingerprint: null,
			});
		});
	});
});
