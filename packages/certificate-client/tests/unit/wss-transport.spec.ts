import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type {
	SignCertificateRequest,
	SignCertificateResponse,
} from "@trading-model/common/ca/ca-client";

const mockEventHandlers = new Map<string, (...args: unknown[]) => void>();

const mockWs = {
	send: jest.fn<(...args: unknown[]) => void>(),
};

const mockConnectionInstance: Record<string, unknown> = {
	on: jest.fn<(event: string, handler: (...args: unknown[]) => void) => void>(
		(event: string, handler: (...args: unknown[]) => void) => {
			mockEventHandlers.set(event, handler);
		}
	),
	state: "connected",
	connect: jest.fn(),
	disconnect: jest.fn(),
	ws: mockWs,
};

const mockAuthHandlerInstance: Record<string, unknown> = {
	handleResponse: jest.fn<(...args: unknown[]) => void>(),
	reset: jest.fn(),
	isAuthSent: false,
};

const mockPendingManagerInstance: Record<string, unknown> = {
	create: jest.fn<(...args: unknown[]) => Promise<SignCertificateResponse>>(),
	handleResponse: jest.fn<(...args: unknown[]) => void>(),
	rejectAll: jest.fn<(...args: unknown[]) => void>(),
	cancel: jest.fn<(...args: unknown[]) => void>(),
};

jest.mock("../../src/wss-transport-connection", () => ({
	WssTransportConnection: jest
		.fn<(...args: unknown[]) => unknown>()
		.mockImplementation(() => mockConnectionInstance),
}));

jest.mock("../../src/auth-handler", () => ({
	AuthHandler: jest
		.fn<(...args: unknown[]) => unknown>()
		.mockImplementation(() => mockAuthHandlerInstance),
	CaWssMessageType: {
		AuthResponse: "auth:response",
		SignResponse: "sign:response",
		Response: "response",
	},
}));

jest.mock("../../src/pending-request-manager", () => ({
	PendingRequestManager: jest
		.fn<(...args: unknown[]) => unknown>()
		.mockImplementation(() => mockPendingManagerInstance),
}));

jest.mock("@trading-model/common/domain/ws-connection", () => ({
	isWsConnected: jest.fn<(...args: unknown[]) => boolean>(),
}));

jest.mock("@trading-model/common/config/logger", () => ({
	logger: {
		error: jest.fn<(...args: unknown[]) => void>(),
	},
}));

import { logger } from "@trading-model/common/config/logger";
import { isWsConnected } from "@trading-model/common/domain/ws-connection";
import { CaWssTransport, NULL_CA_WSS_TRANSPORT } from "../../src/wss-transport";
import { WssTransportConnection } from "../../src/wss-transport-connection";

describe("CaWssTransport", () => {
	const testUrl = "wss://example.com:8443" as any;
	let transport: CaWssTransport;

	beforeEach(() => {
		jest.clearAllMocks();
		mockEventHandlers.clear();
		mockConnectionInstance.state = "connected";
		mockAuthHandlerInstance.isAuthSent = false;
		transport = new CaWssTransport(testUrl);
	});

	describe("constructor", () => {
		it("should create WssTransportConnection with the given url", () => {
			expect(WssTransportConnection).toHaveBeenCalledWith(
				testUrl,
				undefined,
				undefined
			);
		});

		it("should set up open and message event listeners", () => {
			expect(mockConnectionInstance.on).toHaveBeenCalledWith(
				"open",
				expect.any(Function)
			);
			expect(mockConnectionInstance.on).toHaveBeenCalledWith(
				"message",
				expect.any(Function)
			);
		});

		it("should call connect on the connection", () => {
			expect(mockConnectionInstance.connect).toHaveBeenCalled();
		});
	});

	describe("isConnected", () => {
		it("should return true when connection state is connected", () => {
			mockConnectionInstance.state = "connected";
			expect(transport.isConnected).toBe(true);
		});

		it("should return false when connection state is not connected", () => {
			mockConnectionInstance.state = "disconnected";
			expect(transport.isConnected).toBe(false);
		});
	});

	describe("isAuthSent", () => {
		it("should return the auth handler isAuthSent value", () => {
			mockAuthHandlerInstance.isAuthSent = true;
			expect(transport.isAuthSent).toBe(true);
		});

		it("should return false when auth has not been sent", () => {
			mockAuthHandlerInstance.isAuthSent = false;
			expect(transport.isAuthSent).toBe(false);
		});
	});

	describe("mode", () => {
		it("should return wss", () => {
			expect(transport.mode).toBe("wss");
		});
	});

	describe("disconnect", () => {
		it("should disconnect the connection and reject all pending requests", () => {
			transport.disconnect();

			expect(mockConnectionInstance.disconnect).toHaveBeenCalled();
			expect(mockPendingManagerInstance.rejectAll).toHaveBeenCalledWith(
				new Error("Transport disconnected")
			);
		});
	});

	describe("destroy", () => {
		it("should call disconnect", () => {
			transport.destroy();

			expect(mockConnectionInstance.disconnect).toHaveBeenCalled();
			expect(mockPendingManagerInstance.rejectAll).toHaveBeenCalledWith(
				new Error("Transport disconnected")
			);
		});
	});

	describe("signCertificate", () => {
		it("should create a pending request and send sign request via ws", () => {
			(isWsConnected as unknown as jest.Mock).mockReturnValue(true);
			const expectedPromise = new Promise<SignCertificateResponse>(() => {});
			(mockPendingManagerInstance.create as jest.Mock).mockReturnValue(
				expectedPromise
			);
			const request: SignCertificateRequest = {
				serviceId: "svc-1",
				csr: "csr-data",
				ttlMs: 3600000,
			} as SignCertificateRequest;
			const promise = transport.signCertificate(request);

			expect(mockPendingManagerInstance.create).toHaveBeenCalledWith(
				expect.any(String)
			);
			expect(promise).toBe(expectedPromise);
			const id = (mockPendingManagerInstance.create as jest.Mock).mock
				.calls[0][0];
			expect(mockWs.send).toHaveBeenCalledWith(
				JSON.stringify({
					type: "sign",
					id,
					data: { serviceId: "svc-1", csr: "csr-data", ttlMs: 3600000 },
				}),
				expect.any(Function)
			);
		});

		it("should cancel pending request on ws.send error callback", () => {
			(isWsConnected as unknown as jest.Mock).mockReturnValue(true);
			const request: SignCertificateRequest = {
				serviceId: "svc-1",
				csr: "csr-data",
				ttlMs: 3600000,
			} as SignCertificateRequest;
			void transport.signCertificate(request);

			const sendCallback = (mockWs.send as jest.Mock).mock.calls[0][1] as (
				err: Error
			) => void;
			const sendError = new Error("send failed");
			sendCallback(sendError);

			const id = (mockPendingManagerInstance.create as jest.Mock).mock
				.calls[0][0];
			expect(mockPendingManagerInstance.cancel).toHaveBeenCalledWith(
				id,
				sendError
			);
		});

		it("should throw when ws is not connected", () => {
			(isWsConnected as unknown as jest.Mock).mockReturnValue(false);
			const request: SignCertificateRequest = {
				serviceId: "svc-1",
				csr: "csr-data",
				ttlMs: 3600000,
			} as SignCertificateRequest;

			expect(() => transport.signCertificate(request)).toThrow(
				"WebSocket not connected"
			);
			expect(mockPendingManagerInstance.cancel).toHaveBeenCalled();
		});
	});

	describe("on open event", () => {
		it("should reset auth handler when open event fires", () => {
			const openHandler = mockEventHandlers.get("open");
			openHandler!();

			expect(mockAuthHandlerInstance.reset).toHaveBeenCalled();
		});
	});

	describe("_onWsMessage", () => {
		it("should call authHandler.handleResponse on AuthResponse message", () => {
			const messageHandler = mockEventHandlers.get("message")!;
			const msg = { type: "auth:response", success: true };
			messageHandler(Buffer.from(JSON.stringify(msg)));

			expect(mockAuthHandlerInstance.handleResponse).toHaveBeenCalledWith(
				msg,
				expect.any(Function)
			);
		});

		it("should close connection on auth rejection", () => {
			(
				mockAuthHandlerInstance.handleResponse as jest.Mock<any>
			).mockImplementation((_msg: unknown, onRejected: () => void) => {
				onRejected();
			});
			const messageHandler = mockEventHandlers.get("message")!;
			messageHandler(
				Buffer.from(JSON.stringify({ type: "auth:response", success: false }))
			);
			expect(mockConnectionInstance.disconnect).toHaveBeenCalled();
		});

		it("should call pendingManager.handleResponse on SignResponse message", () => {
			const messageHandler = mockEventHandlers.get("message")!;
			const msg = {
				type: "sign:response",
				id: "test-id",
				success: true,
				data: {},
			};
			messageHandler(Buffer.from(JSON.stringify(msg)));

			expect(mockPendingManagerInstance.handleResponse).toHaveBeenCalledWith(
				msg
			);
		});

		it("should call pendingManager.handleResponse on Response message", () => {
			const messageHandler = mockEventHandlers.get("message")!;
			const msg = { type: "response", id: "test-id", success: true, data: {} };
			messageHandler(Buffer.from(JSON.stringify(msg)));

			expect(mockPendingManagerInstance.handleResponse).toHaveBeenCalledWith(
				msg
			);
		});

		it("should log error on invalid JSON message", () => {
			const messageHandler = mockEventHandlers.get("message")!;
			messageHandler(Buffer.from("not valid json"));

			expect(logger.error).toHaveBeenCalledWith("Invalid WSS message from CA");
		});
	});

	describe("NULL_CA_WSS_TRANSPORT", () => {
		it("should have isConnected as false", () => {
			expect(NULL_CA_WSS_TRANSPORT.isConnected).toBe(false);
		});

		it("should have isAuthSent as false", () => {
			expect(NULL_CA_WSS_TRANSPORT.isAuthSent).toBe(false);
		});

		it("should throw when signCertificate is called", () => {
			expect(() => NULL_CA_WSS_TRANSPORT.signCertificate()).toThrow(
				"WSS transport not available"
			);
		});

		it("should have destroy and disconnect as no-ops", () => {
			expect(() => NULL_CA_WSS_TRANSPORT.destroy()).not.toThrow();
			expect(() => NULL_CA_WSS_TRANSPORT.disconnect()).not.toThrow();
		});
	});
});
