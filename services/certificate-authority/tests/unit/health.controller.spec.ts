import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const MOCK_IS_INITIALIZED = jest.fn();
const MOCK_GET_CA_CERT_PEM = jest.fn();

jest.mock("../../src/app/container", () => ({
	CONTAINER: {
		ca: {
			isInitialized: MOCK_IS_INITIALIZED,
			getCaCertPem: MOCK_GET_CA_CERT_PEM,
		},
	},
}));

import { health, ping } from "../../src/controllers/health.controller";

describe("health.controller", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("ping", () => {
		it("should return ok status", () => {
			const json = jest.fn();
			const status = jest.fn(() => ({ json }));
			const req = {} as any;
			const res = { status } as any;

			ping(req, res);

			expect(res.status).toHaveBeenCalledWith(200);
			expect(res.status().json).toHaveBeenCalledWith({ status: "ok" });
		});
	});

	describe("health", () => {
		it("should return 200 when CA is initialized", () => {
			const json = jest.fn();
			const status = jest.fn(() => ({ json }));
			const req = {} as any;
			const res = { status } as any;

			MOCK_IS_INITIALIZED.mockReturnValue(true);
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

		it("should return 503 when CA is not initialized", () => {
			const json = jest.fn();
			const status = jest.fn(() => ({ json }));
			const req = {} as any;
			const res = { status } as any;

			MOCK_IS_INITIALIZED.mockReturnValue(false);

			health(req, res);

			expect(res.status).toHaveBeenCalledWith(503);
			expect(res.status().json).toHaveBeenCalledWith({
				status: "unavailable",
				caInitialized: false,
			});
		});

		it("should return null caFingerprint when no CA cert PEM", () => {
			const json = jest.fn();
			const status = jest.fn(() => ({ json }));
			const req = {} as any;
			const res = { status } as any;

			MOCK_IS_INITIALIZED.mockReturnValue(true);
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
