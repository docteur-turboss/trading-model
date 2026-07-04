import { createServer } from "node:http";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { WebSocket, WebSocketServer } from "ws";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}));

jest.mock("@trading-model/common/utils/errors", () => ({
	normalizeError: (err: Error) => err,
}));

const MOCK_DISTRIBUTOR = {
	requestCertificate: jest.fn(),
};

jest.mock("../../src/app/container", () => ({
	CONTAINER: {
		distributor: MOCK_DISTRIBUTOR,
	},
}));

import { attachWsServer } from "../../src/app/ws-server";

function createHttpServer(): ReturnType<typeof createServer> {
	return createServer();
}

function createWsMessage(
	type: string,
	overrides: Record<string, unknown> = {}
): string {
	return JSON.stringify({ type, ...overrides });
}

describe("ws-server", () => {
	let httpServer: ReturnType<typeof createServer>;
	let wss: WebSocketServer;
	let _wsClient: WebSocket;

	beforeEach(() => {
		jest.clearAllMocks();
		httpServer = createHttpServer();
		wss = attachWsServer(httpServer as any);
	});

	afterEach(() => {
		wss.close();
		httpServer.close();
	});

	function _connectClient(): Promise<WebSocket> {
		return new Promise((resolve, reject) => {
			wss.on("connection", () => {
				// already listening
			});
			const addr = wss.address() as { port: number };
			if (!addr) {
				reject(new Error("Server not listening"));
				return;
			}
			const client = new WebSocket(`ws://localhost:${addr.port}`);
			client.on("open", () => resolve(client));
			client.on("error", reject);
		});
	}

	it("should attach a WebSocket server and return it", () => {
		expect(wss).toBeInstanceOf(WebSocketServer);
	});

	function withWs<T>(
		fn: (
			client: WebSocket,
			serverAddr: ReturnType<typeof httpServer.listen>,
			resolve: (value: T) => void
		) => void
	): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const serverAddr = httpServer.listen(0);
			const wsUrl = `ws://localhost:${(serverAddr.address() as any).port}`;
			const client = new WebSocket(wsUrl);

			client.on("open", () => fn(client, serverAddr, resolve));
			client.on("error", (err) => {
				serverAddr.close();
				reject(err);
			});
		});
	}

	it("should handle invalid JSON messages", () => {
		return withWs<void>((client, serverAddr, resolve) => {
			client.send("not-json");
			client.on("message", (raw) => {
				const msg = JSON.parse(raw.toString());
				expect(msg.type).toBe("error");
				expect(msg.error.message).toBe("Invalid JSON");
				client.close();
				serverAddr.close();
				resolve();
			});
		});
	});

	it("should handle auth message with valid token", () => {
		return withWs<void>((client, serverAddr, resolve) => {
			client.send(createWsMessage("auth", { token: "a".repeat(20) }));
			client.on("message", (raw) => {
				const msg = JSON.parse(raw.toString());
				if (msg.type === "auth:response") {
					expect(msg.success).toBe(true);
					client.close();
					serverAddr.close();
					resolve();
				}
			});
		});
	});

	it("should reject auth message with short token", () => {
		return withWs<void>((client, serverAddr, resolve) => {
			client.send(createWsMessage("auth", { token: "short" }));
			client.on("message", (raw) => {
				const msg = JSON.parse(raw.toString());
				if (msg.type === "auth:response") {
					expect(msg.success).toBe(false);
					client.close();
					serverAddr.close();
					resolve();
				}
			});
		});
	});

	it("should reject sign message with missing serviceId", () => {
		return withWs<void>((client, serverAddr, resolve) => {
			client.send(
				createWsMessage("sign", { id: "req-1", data: { csr: "csr-data" } })
			);
			client.on("message", (raw) => {
				const msg = JSON.parse(raw.toString());
				if (msg.type === "sign:response") {
					expect(msg.success).toBe(false);
					expect(msg.error.message).toBe("Invalid request");
					client.close();
					serverAddr.close();
					resolve();
				}
			});
		});
	});

	it("should successfully sign with valid request", () => {
		MOCK_DISTRIBUTOR.requestCertificate.mockResolvedValue({
			certPem: "signed-cert",
			caPem: "ca-pem",
			serialNumber: "SN-001",
			expiresAt: new Date(),
			fingerprint: "fp123",
		});

		return withWs<void>((client, serverAddr, resolve) => {
			client.send(
				createWsMessage("sign", {
					id: "req-1",
					data: { serviceId: "svc-1", csr: "csr-data" },
				})
			);
			client.on("message", (raw) => {
				const msg = JSON.parse(raw.toString());
				if (msg.type === "sign:response") {
					expect(msg.success).toBe(true);
					expect(msg.data.cert).toBe("signed-cert");
					expect(msg.data.serialNumber).toBe("SN-001");
					client.close();
					serverAddr.close();
					resolve();
				}
			});
		});
	});

	it("should handle distributor errors gracefully", () => {
		MOCK_DISTRIBUTOR.requestCertificate.mockRejectedValue(
			Object.assign(new Error("Sign failed"), { statusCode: 403 })
		);

		return withWs<void>((client, serverAddr, resolve) => {
			client.send(
				createWsMessage("sign", {
					id: "req-1",
					data: { serviceId: "svc-1", csr: "csr-data" },
				})
			);
			client.on("message", (raw) => {
				const msg = JSON.parse(raw.toString());
				if (msg.type === "sign:response") {
					expect(msg.success).toBe(false);
					expect(msg.error.code).toBe(403);
					client.close();
					serverAddr.close();
					resolve();
				}
			});
		});
	});

	it("should limit unauthenticated sign requests", () => {
		return withWs<void>((client, serverAddr, resolve) => {
			const messages: Record<string, unknown>[] = [];

			for (let i = 0; i < 5; i++) {
				client.send(
					createWsMessage("sign", {
						id: `req-${i}`,
						data: { serviceId: "svc-1", csr: "csr-data" },
					})
				);
			}

			client.on("message", (raw) => {
				const msg = JSON.parse(raw.toString());
				if (msg.type === "sign:response") {
					messages.push(msg);
					if (messages.length >= 4) {
						const rateLimited = messages.filter(
							(m) => (m.error as Record<string, unknown>)?.code === 429
						);
						expect(rateLimited.length).toBeGreaterThan(0);
						client.close();
						serverAddr.close();
						resolve();
					}
				}
			});
		});
	});
});
