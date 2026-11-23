import http from "node:http";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import { HTTP_HEADERS } from "@trading-model/contracts/http-headers";
import express from "express";

jest.setTimeout(15000);

const ENV: any = {
	NODE_ENV: "test",
	PORT: 0,
	TLS_KEY_PATH: "/k",
	TLS_CERT_PATH: "/c",
	TLS_CA_PATH: "/a",
	RATE_LIMIT_WINDOW_MS: 60000,
	RATE_LIMIT_MAX: 1000,
	CACHE_TTL_MS: 30000,
	AUTH_TOKEN_HEADER: "x-api-key",
	AUTH_TOKENS:
		"all:read:test-token,all2:read:secondary-token,reader:read:reader-secret,ops-alice:read:alice-secret",
	PROXY_TIMEOUT_MS: 5000,
	ALLOWED_PROXY_CIDRS: "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.0/8",
};

jest.mock("@trading-model/http/logger", () => ({
	logger: {
		info: jest.fn<(...args: any[]) => any>(),
		warn: jest.fn<(...args: any[]) => any>(),
		error: jest.fn<(...args: any[]) => any>(),
	},
}));

// The Service DNS name, no registry (ADR-0072); trader-trainer does not resolve.
jest.mock("node:dns/promises", () => ({
	lookup: jest
		.fn<(...args: any[]) => any>()
		.mockImplementation((name: string) =>
			name === "trader-trainer"
				? Promise.reject(new Error("getaddrinfo ENOTFOUND trader-trainer"))
				: Promise.resolve({ address: "10.0.0.5", family: 4 })
		),
}));

jest.mock("../../src/adapters/outbound/proxy-handler", () => ({
	forwardRequest: jest.fn<(...args: any[]) => any>(),
}));

import { createRouter } from "../../src/adapters/inbound/router";
import type { ProxyResult } from "../../src/adapters/outbound/proxy-handler";
import { forwardRequest } from "../../src/adapters/outbound/proxy-handler";
import type { ForwardableRequest } from "../../src/domain/ports/gateway.port";
import { safeHeaders } from "../../src/shared/proxy-header-sanitizer";

interface RequestOptions {
	method?: string;
	body?: unknown;
	headers?: Record<string, string>;
}

function createApp(): express.Application {
	const app = express();
	app.use(express.json());
	app.use("/", createRouter(ENV));
	return app;
}

function request(
	server: http.Server,
	path: string,
	options: RequestOptions = {}
): Promise<{ status: number; body: unknown }> {
	return new Promise((resolve, reject) => {
		const addr = server.address();
		if (!addr || typeof addr === "string") {
			reject(new Error("Server not listening"));
			return;
		}
		const data = options.body ? JSON.stringify(options.body) : undefined;
		const req = http.request(
			{
				hostname: "localhost",
				port: addr.port,
				path,
				method: options.method ?? "GET",
				headers: {
					"Content-Type": "application/json",
					Connection: "close",
					...(data
						? { "Content-Length": Buffer.byteLength(data).toString() }
						: {}),
					...(options.headers ?? {}),
				},
			},
			(res) => {
				let raw = "";
				res.on("data", (chunk: Buffer) => {
					raw += chunk.toString();
				});
				res.on("end", () => {
					try {
						resolve({ status: res.statusCode ?? 500, body: JSON.parse(raw) });
					} catch {
						resolve({ status: res.statusCode ?? 500, body: raw });
					}
				});
				res.on("error", reject);
			}
		);
		req.on("error", reject);
		if (data) {
			req.write(data);
		}
		req.end();
	});
}

const AUTH_HEADERS = { [HTTP_HEADERS.X_API_KEY]: "test-token" };

function mockProxySuccess(result?: Partial<ProxyResult>): void {
	(forwardRequest as jest.Mock<(...args: any[]) => any>).mockResolvedValue({
		status: 200,
		body: JSON.stringify({ data: "ok" }),
		headers: { "content-type": "application/json" },
		...result,
	});
}

describe("API Gateway — Routes Integration", () => {
	let server: http.Server;

	beforeEach(() => {
		mockProxySuccess();
	});

	afterEach(() => {
		jest.clearAllMocks();
		return new Promise<void>((resolve) => {
			if (server?.listening) {
				server.closeAllConnections();
				server.close(() => resolve());
			} else {
				resolve();
			}
		});
	});

	it("should reject a proxied request without an auth token", async () => {
		const app = createApp();
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => resolve());
		});
		const result = await request(server, "/v1/audit-logger/events");
		expect(result.status).toBe(401);
		expect(result.body).toEqual({ error: "Missing authentication token" });
	});

	it("should reject a proxied request with an invalid token", async () => {
		const app = createApp();
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => resolve());
		});
		const result = await request(server, "/v1/audit-logger/events", {
			headers: { [HTTP_HEADERS.X_API_KEY]: "invalid-token" },
		});
		expect(result.status).toBe(401);
		expect(result.body).toEqual({ error: "Invalid authentication token" });
	});

	it("should proxy a request with a valid token", async () => {
		const app = createApp();
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => resolve());
		});
		const result = await request(server, "/v1/audit-logger/events", {
			headers: AUTH_HEADERS,
		});
		expect(result.status).toBe(200);
		expect(result.body).toEqual({ data: "ok" });
		expect(forwardRequest).toHaveBeenCalledTimes(1);
	});

	it("should forward the path and method to the target service", async () => {
		const app = createApp();
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => resolve());
		});
		await request(server, "/v1/audit-logger/events/stats", {
			headers: AUTH_HEADERS,
		});
		const call = (forwardRequest as jest.Mock<(...args: any[]) => any>).mock
			.calls[0][0];
		expect(call).toMatchObject({ path: "/events/stats" });
	});

	it("should return 503 when the service name does not resolve", async () => {
		const app = createApp();
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => resolve());
		});
		const result = await request(server, "/v1/trader-trainer/training-status", {
			headers: AUTH_HEADERS,
		});
		expect(result.status).toBe(503);
		expect(result.body).toMatchObject({ error: "Service unavailable" });
		expect(forwardRequest).not.toHaveBeenCalled();
	});

	it("should return 400 for an invalid route format", async () => {
		const app = createApp();
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => resolve());
		});
		const result = await request(server, "/bad-route", {
			headers: AUTH_HEADERS,
		});
		expect(result.status).toBe(400);
	});

	it("should return 400 for an invalid version number", async () => {
		const app = createApp();
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => resolve());
		});
		const result = await request(server, "/v0/invalid/path", {
			headers: AUTH_HEADERS,
		});
		expect(result.status).toBe(400);
	});

	it("should serve a cached GET response without proxying again", async () => {
		mockProxySuccess({ body: JSON.stringify({ data: "cached" }) });

		const app = createApp();
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => resolve());
		});
		const path = "/v1/audit-logger/events/cache-me";

		const first = await request(server, path, { headers: AUTH_HEADERS });
		expect(first.status).toBe(200);
		expect(first.body).toEqual({ data: "cached" });
		expect(forwardRequest).toHaveBeenCalledTimes(1);

		const second = await request(server, path, { headers: AUTH_HEADERS });
		expect(second.status).toBe(200);
		expect(second.body).toEqual({ data: "cached" });
		expect(forwardRequest).toHaveBeenCalledTimes(1);
	});

	it("should return 503 when the target service is unreachable", async () => {
		(forwardRequest as jest.Mock<(...args: any[]) => any>).mockRejectedValue(
			new Error("Connection timeout")
		);

		const app = createApp();
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => resolve());
		});
		const result = await request(server, "/v1/audit-logger/events/error-path", {
			headers: AUTH_HEADERS,
		});
		expect(result.status).toBe(503);
		// The cause is logged, never returned: it would map the internal network.
		expect(result.body).toEqual({ error: "Service unavailable" });
	});

	it("lets a read-only key read the audit events", async () => {
		mockProxySuccess({ body: JSON.stringify({ entries: [] }) });
		const app = createApp();
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => resolve());
		});
		const result = await request(server, "/v1/audit-logger/events", {
			headers: { [HTTP_HEADERS.X_API_KEY]: "reader-secret" },
		});
		expect(result.status).toBe(200);
	});

	it("forwards a request with the key name as x-actor, never the secret nor a client x-actor", async () => {
		mockProxySuccess({ body: JSON.stringify({ events: [] }) });
		const app = createApp();
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => resolve());
		});
		const result = await request(
			server,
			"/v1/audit-logger/events/actor-check",
			{
				headers: {
					[HTTP_HEADERS.X_API_KEY]: "alice-secret",
					"x-actor": "forged",
				},
			}
		);
		expect(result.status).toBe(200);
		const { req } = jest.mocked(forwardRequest).mock.calls[0][0] as {
			req: ForwardableRequest;
		};
		const forwarded = safeHeaders(req, "x-api-key");
		expect(forwarded["x-actor"]).toBe("ops-alice");
		expect(JSON.stringify(forwarded)).not.toContain("alice-secret");
	});

	it.each([
		["GET", "/v2/audit-logger/events"],
		["POST", "/v1/discovery-server/register"],
		["POST", "/v1/discovery-server/heartbeat"],
		["POST", "/v1/discovery-server/unregister"],
		["POST", "/v1/dlq-service/dlq/replay"],
		["GET", "/v1/financial-scraper/metrics"],
		["GET", "/v1/nonexistent-service/ping"],
		// URL normalization would forward these to POST /register.
		["POST", "/v1/discovery-server/services/../register"],
		["POST", "/v1/discovery-server/services/%2e%2e/register"],
		["POST", "/v1/discovery-server/services\\..\\register"],
	])(
		"should not proxy %s %s, which is not a public route",
		async (method, path) => {
			const app = createApp();
			await new Promise<void>((resolve) => {
				server = app.listen(0, () => resolve());
			});
			const result = await request(server, path, {
				method,
				headers: AUTH_HEADERS,
				body: { serviceName: "api-gateway", ip: "10.0.0.9", port: 22 },
			});
			expect(result.status).toBe(404);
			expect(result.body).toEqual({ error: "Route not found" });
			expect(forwardRequest).not.toHaveBeenCalled();
		}
	);
});
