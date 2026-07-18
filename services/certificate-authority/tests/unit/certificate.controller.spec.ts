import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const MOCK_SIGN_SERVICE_CERTIFICATE = jest.fn();
const MOCK_GET_BY_SERVICE_ID = jest.fn();
const MOCK_REVOKE_CERTIFICATE = jest.fn();

jest.mock("../../src/app", () => ({
	container: {
		ca: {
			signCertificate: MOCK_SIGN_SERVICE_CERTIFICATE,
			revokeCertificate: MOCK_REVOKE_CERTIFICATE,
		},
		certificateStore: {
			getByServiceId: MOCK_GET_BY_SERVICE_ID,
		},
	},
}));

import {
	getCertificate,
	revokeCertificate,
	signCertificate,
} from "../../src/controllers/certificate.controller";

function mockReqRes() {
	const json = jest.fn();
	const status = jest.fn(() => ({ json }));
	return {
		req: {} as any,
		res: { status, json } as any,
	};
}

describe("certificate.controller", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("signCertificate", () => {
		it("should return 400 when serviceId is missing", async () => {
			const { req, res } = mockReqRes();
			req.body = { csr: "csr-data" };

			await signCertificate(req, res);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.status().json).toHaveBeenCalledWith({
				error: "serviceId and csr are required",
			});
		});

		it("should return 400 when csr is missing", async () => {
			const { req, res } = mockReqRes();
			req.body = { serviceId: "svc-1" };

			await signCertificate(req, res);

			expect(res.status).toHaveBeenCalledWith(400);
		});

		it("should sign and return certificate", async () => {
			const { req, res } = mockReqRes();
			req.body = { serviceId: "svc-1", csr: "csr-data", ttlMs: 3600000 };

			const signed = {
				certPem: "cert-pem",
				caPem: "ca-pem",
				serialNumber: "SN-001",
				expiresAt: new Date(),
				fingerprint: "fp123",
			};
			MOCK_SIGN_SERVICE_CERTIFICATE.mockResolvedValue(signed);

			await signCertificate(req, res);

			expect(MOCK_SIGN_SERVICE_CERTIFICATE).toHaveBeenCalledWith({
				serviceId: "svc-1",
				csr: "csr-data",
				ttlMs: 3600000,
			});
			expect(res.status).toHaveBeenCalledWith(200);
			expect(res.status().json).toHaveBeenCalledWith({
				certPem: "cert-pem",
				caPem: "ca-pem",
				serialNumber: "SN-001",
				expiresAt: signed.expiresAt,
				fingerprint: "fp123",
			});
		});

		it("should return 500 on error", async () => {
			const { req, res } = mockReqRes();
			req.body = { serviceId: "svc-1", csr: "csr-data" };
			MOCK_SIGN_SERVICE_CERTIFICATE.mockRejectedValue(new Error("sign error"));

			await signCertificate(req, res);

			expect(res.status).toHaveBeenCalledWith(500);
		});
	});

	describe("getCertificate", () => {
		it("should return 400 when serviceId param is missing", async () => {
			const { req, res } = mockReqRes();
			req.params = {};

			await getCertificate(req, res);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.status().json).toHaveBeenCalledWith({
				error: "serviceId is required",
			});
		});

		it("should return 404 when certificate not found", async () => {
			const { req, res } = mockReqRes();
			req.params = { serviceId: "svc-missing" };
			MOCK_GET_BY_SERVICE_ID.mockResolvedValue(null);

			await getCertificate(req, res);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.status().json).toHaveBeenCalledWith({
				error: "Certificate not found",
			});
		});

		it("should return certificate when found", async () => {
			const { req, res } = mockReqRes();
			req.params = { serviceId: "svc-1" };
			const cert = {
				certPem: "cert-pem",
				caPem: "ca-pem",
				serialNumber: "SN-001",
				issuedAt: new Date(),
				expiresAt: new Date(),
				fingerprint: "fp123",
			};
			MOCK_GET_BY_SERVICE_ID.mockResolvedValue(cert);

			await getCertificate(req, res);

			expect(MOCK_GET_BY_SERVICE_ID).toHaveBeenCalledWith("svc-1");
			expect(res.status).toHaveBeenCalledWith(200);
			expect(res.status().json).toHaveBeenCalledWith({
				certPem: "cert-pem",
				caPem: "ca-pem",
				serialNumber: "SN-001",
				issuedAt: cert.issuedAt,
				expiresAt: cert.expiresAt,
				fingerprint: "fp123",
			});
		});

		it("should return 500 on error", async () => {
			const { req, res } = mockReqRes();
			req.params = { serviceId: "svc-1" };
			MOCK_GET_BY_SERVICE_ID.mockRejectedValue(new Error("DB error"));

			await getCertificate(req, res);

			expect(res.status).toHaveBeenCalledWith(500);
		});
	});

	describe("revokeCertificate", () => {
		it("should return 400 when serialNumber is missing", async () => {
			const { req, res } = mockReqRes();
			req.body = { reason: "key_compromise" };

			await revokeCertificate(req, res);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.status().json).toHaveBeenCalledWith({
				error: "serialNumber and reason are required",
			});
		});

		it("should return 400 when reason is missing", async () => {
			const { req, res } = mockReqRes();
			req.body = { serialNumber: "SN-001" };

			await revokeCertificate(req, res);

			expect(res.status).toHaveBeenCalledWith(400);
		});

		it("should revoke and return success", async () => {
			const { req, res } = mockReqRes();
			req.body = { serialNumber: "SN-001", reason: "key_compromise" };

			await revokeCertificate(req, res);

			expect(MOCK_REVOKE_CERTIFICATE).toHaveBeenCalledWith({
				serialNumber: "SN-001",
				reason: "key_compromise",
			});
			expect(res.status).toHaveBeenCalledWith(200);
			expect(res.status().json).toHaveBeenCalledWith({
				message: "Certificate revoked",
			});
		});

		it("should return 500 on error", async () => {
			const { req, res } = mockReqRes();
			req.body = { serialNumber: "SN-001", reason: "test" };
			MOCK_REVOKE_CERTIFICATE.mockRejectedValue(new Error("revoke error"));

			await revokeCertificate(req, res);

			expect(res.status).toHaveBeenCalledWith(500);
		});
	});
});
