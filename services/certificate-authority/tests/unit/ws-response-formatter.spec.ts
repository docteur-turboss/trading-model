import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { WebSocket } from "ws";

jest.mock("../../src/app/ws-message-router", () => ({
	WsMessageType: {
		SignResponse: "sign:response",
	},
}));

import {
	buildSignErrorPayload,
	buildSignResponsePayload,
	sendJsonError,
	sendRateLimitError,
	sendSignError,
} from "../../src/app/ws-response-formatter";

describe("ws-response-formatter", () => {
	let mockWs: jest.Mocked<WebSocket>;

	beforeEach(() => {
		jest.clearAllMocks();
		mockWs = { send: jest.fn() } as any;
	});

	describe("buildSignResponsePayload", () => {
		it("should build success payload with cert data", () => {
			const expiresAt = new Date("2026-01-01T00:00:00Z");
			const result = buildSignResponsePayload("req-1", {
				certPem: "cert-data",
				caPem: "ca-data",
				serialNumber: "SN-001",
				expiresAt,
				fingerprint: "fp123",
			});
			const parsed = JSON.parse(result);
			expect(parsed.type).toBe("sign:response");
			expect(parsed.id).toBe("req-1");
			expect(parsed.success).toBe(true);
			expect(parsed.data.certPem).toBe("cert-data");
			expect(parsed.data.caPem).toBe("ca-data");
			expect(parsed.data.serialNumber).toBe("SN-001");
			expect(parsed.data.expiresAt).toBe("2026-01-01T00:00:00.000Z");
			expect(parsed.data.fingerprint).toBe("fp123");
		});
	});

	describe("buildSignErrorPayload", () => {
		it("should build error payload with code", () => {
			const result = buildSignErrorPayload("req-2", 403);
			const parsed = JSON.parse(result);
			expect(parsed.type).toBe("sign:response");
			expect(parsed.id).toBe("req-2");
			expect(parsed.success).toBe(false);
			expect(parsed.error.message).toBe("Certificate signing failed");
			expect(parsed.error.code).toBe(403);
		});
	});

	describe("sendJsonError", () => {
		it("should send error message via ws", () => {
			sendJsonError(mockWs, "Invalid JSON");
			expect(mockWs.send).toHaveBeenCalledWith(
				JSON.stringify({ type: "error", error: { message: "Invalid JSON" } })
			);
		});
	});

	describe("sendSignError", () => {
		it("should send sign error via ws", () => {
			sendSignError(mockWs, "req-3", "CSR rejected");
			expect(mockWs.send).toHaveBeenCalledWith(
				JSON.stringify({
					type: "sign:response",
					id: "req-3",
					success: false,
					error: { message: "CSR rejected" },
				})
			);
		});
	});

	describe("sendRateLimitError", () => {
		it("should send rate limit error via ws", () => {
			sendRateLimitError(mockWs);
			const sent = JSON.parse((mockWs.send as jest.Mock).mock.calls[0][0]);
			expect(sent.type).toBe("sign:response");
			expect(sent.success).toBe(false);
			expect(sent.error.code).toBe(429);
			expect(sent.id).toBe("unknown");
		});
	});
});
