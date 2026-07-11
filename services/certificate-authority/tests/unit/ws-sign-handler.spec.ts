import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { WebSocket } from "ws";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("@trading-model/common/utils/errors", () => ({
	normalizeError: jest.fn((err: Error) => err),
}));

jest.mock("@trading-model/common/domain/primitives", () => ({
	toServiceId: (v: string) => v,
	CsrPem: { of: (v: string) => v },
}));

const MOCK_DISTRIBUTOR = {
	requestCertificate: jest.fn(),
};

jest.mock("../../src/app/index", () => ({
	container: {
		distributor: MOCK_DISTRIBUTOR,
	},
}));

jest.mock("../../src/app/ws-response-formatter", () => ({
	buildSignResponsePayload: jest.fn((id: string, cert: any) =>
		JSON.stringify({ type: "sign:response", id, success: true, data: cert })
	),
	buildSignErrorPayload: jest.fn((id: string, code: number) =>
		JSON.stringify({
			type: "sign:response",
			id,
			success: false,
			error: { code },
		})
	),
}));

import {
	buildSignErrorPayload,
	buildSignResponsePayload,
} from "../../src/app/ws-response-formatter";
import {
	handleSignRequest,
	WS_SIGN_SCHEMA,
	type WssSession,
} from "../../src/app/ws-sign-handler";

describe("ws-sign-handler", () => {
	let mockWs: jest.Mocked<WebSocket>;
	let mockSession: WssSession;

	beforeEach(() => {
		jest.clearAllMocks();
		mockWs = { send: jest.fn() } as any;
		mockSession = {
			state: {
				tokenProvided: false,
				bootstrapToken: undefined,
				authAttempts: 0,
				requestCount: 0,
				requestWindowStart: Date.now(),
			},
			clientIdentity: "test-client" as any,
			limiterKey: "test-client",
		};
	});

	it("should parse valid sign schema", () => {
		const result = WS_SIGN_SCHEMA.safeParse({
			type: "sign",
			id: "req-1",
			data: { serviceId: "svc-1", csr: "csr-data", ttlMs: 3600000 },
		});
		expect(result.success).toBe(true);
	});

	it("should reject sign schema without serviceId", () => {
		const result = WS_SIGN_SCHEMA.safeParse({
			type: "sign",
			id: "req-1",
			data: { csr: "csr-data" },
		});
		expect(result.success).toBe(false);
	});

	it("should reject sign schema without csr", () => {
		const result = WS_SIGN_SCHEMA.safeParse({
			type: "sign",
			id: "req-1",
			data: { serviceId: "svc-1" },
		});
		expect(result.success).toBe(false);
	});

	it("should reject sign schema with empty id", () => {
		const result = WS_SIGN_SCHEMA.safeParse({
			type: "sign",
			id: "",
			data: { serviceId: "svc-1", csr: "csr-data" },
		});
		expect(result.success).toBe(false);
	});

	it("should handle sign request successfully", async () => {
		const mockCert = {
			certPem: "signed-cert",
			caPem: "ca-pem",
			serialNumber: "SN-001",
			expiresAt: new Date(),
			fingerprint: "fp123",
		};
		MOCK_DISTRIBUTOR.requestCertificate.mockResolvedValue(mockCert);

		await handleSignRequest(
			mockWs,
			{
				type: "sign",
				id: "req-1",
				data: { serviceId: "svc-1", csr: "csr-data" },
			} as any,
			mockSession
		);

		expect(MOCK_DISTRIBUTOR.requestCertificate).toHaveBeenCalledWith(
			"svc-1",
			"csr-data",
			undefined
		);
		expect(buildSignResponsePayload).toHaveBeenCalledWith("req-1", mockCert);
		expect(mockWs.send).toHaveBeenCalled();
	});

	it("should pass bootstrap token when authenticated", async () => {
		mockSession.state.tokenProvided = true;
		mockSession.state.bootstrapToken = "my-token";
		const mockCert = {
			certPem: "cert",
			caPem: "ca",
			serialNumber: "SN-002",
			expiresAt: new Date(),
			fingerprint: "fp456",
		};
		MOCK_DISTRIBUTOR.requestCertificate.mockResolvedValue(mockCert);

		await handleSignRequest(
			mockWs,
			{
				type: "sign",
				id: "req-2",
				data: { serviceId: "svc-2", csr: "csr-2" },
			} as any,
			mockSession
		);

		expect(MOCK_DISTRIBUTOR.requestCertificate).toHaveBeenCalledWith(
			"svc-2",
			"csr-2",
			"my-token"
		);
	});

	it("should handle distributor errors", async () => {
		const error = Object.assign(new Error("Sign failed"), { statusCode: 403 });
		MOCK_DISTRIBUTOR.requestCertificate.mockRejectedValue(error);

		await handleSignRequest(
			mockWs,
			{
				type: "sign",
				id: "req-3",
				data: { serviceId: "svc-3", csr: "csr-3" },
			} as any,
			mockSession
		);

		expect(buildSignErrorPayload).toHaveBeenCalledWith("req-3", 403);
	});

	it("should use default status code 500 when error has no statusCode", async () => {
		MOCK_DISTRIBUTOR.requestCertificate.mockRejectedValue(
			new Error("Unknown error")
		);

		await handleSignRequest(
			mockWs,
			{
				type: "sign",
				id: "req-4",
				data: { serviceId: "svc-4", csr: "csr-4" },
			} as any,
			mockSession
		);

		expect(buildSignErrorPayload).toHaveBeenCalledWith("req-4", 500);
	});
});
