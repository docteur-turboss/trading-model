import http from "node:http";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import { HTTP_HEADERS } from "@trading-model/common/http-headers";
import express from "express";

jest.setTimeout(15000);

jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: {
		NODE_ENV: "test",
		PORT: 0,
		TLS_KEY_PATH: "",
		TLS_CERT_PATH: "",
		TLS_CA_PATH: "",
		DISCOVERY_SERVICE_URL: "http://localhost:3000",
		RATE_LIMIT_WINDOW_MS: 60000,
		RATE_LIMIT_MAX: 1000,
		CACHE_TTL_MS: 30000,
		AUTH_TOKEN_HEADER: "x-api-key",
		AUTH_TOKENS: "test-token,secondary-token",
		PROXY_TIMEOUT_MS: 5000,
	},
}));

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../src/adapters/outbound/service-resolver", () => ({
	ServiceResolver: jest.fn().mockImplementation(() => ({
		resolve: jest.fn().mockImplementation((serviceName: string) => {
			if (serviceName === "nonexistent-service") {
				return Promise.resolve(null);
			}
			return Promise.resolve({
				host: "10.0.0.5",
				port: 3000,
				version: "1.2.0",
			});
		}),
	})),
}));

jest.mock("../../src/adapters/outbound/proxy-handler", () => ({
	forwardRequest: jest.fn(),
}));

import { createRouter } from "../../src/adapters/inbound/router";
import type { ProxyResult } from "../../src/adapters/outbound/proxy-handler";
import { forwardRequest } from "../../src/adapters/outbound/proxy-handler";

interface RequestOptions {
	method?: string;
	body?: unknown;
	headers?: Record<string, string>;
}

function createApp(): express.Application {
	const app = express();
	app.use(express.json());
	app.use("/", createRouter());
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
	(forwardRequest as jest.Mock).mockResolvedValue({
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

	it("GET /ping should return 200 without authentication", async () => {
		const app = createApp();
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => resolve());
		});
		const result = await request(server, "/ping");
		expect(result.status).toBe(200);
		expect(result.body).toHaveProperty("status", "ok");
	});

	it("should reject a proxied request without an auth token", async () => {
		const app = createApp();
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => resolve());
		});
		const result = await request(server, "/v1/discovery-server/services");
		expect(result.status).toBe(401);
		expect(result.body).toEqual({ error: "Missing authentication token" });
	});

	it("should reject a proxied request with an invalid token", async () => {
		const app = createApp();
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => resolve());
		});
		const result = await request(server, "/v1/discovery-server/services", {
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
		const result = await request(server, "/v1/discovery-server/services", {
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
		await request(server, "/v1/discovery-server/health", {
			headers: AUTH_HEADERS,
		});
		const call = (forwardRequest as jest.Mock).mock.calls[0][0];
		expect(call).toMatchObject({ path: "/health" });
	});

	it("should return 404 when the service is not registered", async () => {
		const app = createApp();
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => resolve());
		});
		const result = await request(server, "/v1/nonexistent-service/ping", {
			headers: AUTH_HEADERS,
		});
		expect(result.status).toBe(404);
		expect(result.body).toMatchObject({
			error: "Service not found",
			service: "nonexistent-service",
			version: 1,
		});
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
		const path = "/v1/discovery-server/services/cache-me";

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
		(forwardRequest as jest.Mock).mockRejectedValue(
			new Error("Connection timeout")
		);

		const app = createApp();
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => resolve());
		});
		const result = await request(server, "/v1/discovery-server/error-path", {
			headers: AUTH_HEADERS,
		});
		expect(result.status).toBe(503);
		expect(result.body).toMatchObject({
			error: "Service unavailable",
			details: "Connection timeout",
		});
	});

	it("should proxy a POST request with a JSON body", async () => {
		mockProxySuccess({ body: JSON.stringify({ saved: true }) });

		const app = createApp();
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => resolve());
		});
		const result = await request(server, "/v1/discovery-server/register", {
			method: "POST",
			headers: AUTH_HEADERS,
			body: { serviceName: "test-service" },
		});
		expect(result.status).toBe(200);
		expect(result.body).toEqual({ saved: true });
		expect(forwardRequest).toHaveBeenCalledTimes(1);
	});
});
