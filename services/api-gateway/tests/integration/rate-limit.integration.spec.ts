import http from "node:http";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
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
	RATE_LIMIT_MAX: 2,
	CACHE_TTL_MS: 30000,
	AUTH_TOKEN_HEADER: "x-api-key",
	AUTH_TOKENS: "a:read:test-token,b:read:other-token",
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

// The Service DNS name, no registry (ADR-0072).
jest.mock("node:dns/promises", () => ({
	lookup: jest
		.fn<(...args: any[]) => any>()
		.mockResolvedValue({ address: "10.0.0.5", family: 4 }),
}));

jest.mock("../../src/adapters/outbound/proxy-handler", () => ({
	forwardRequest: jest.fn<(...args: any[]) => any>().mockResolvedValue({
		status: 200,
		body: JSON.stringify({ data: "ok" }),
		headers: { "content-type": "application/json" },
	}),
}));

import { createRouter } from "../../src/adapters/inbound/router";

function createApp(): express.Application {
	const app = express();
	app.use(express.json());
	app.use("/", createRouter(ENV));
	return app;
}

function request(
	server: http.Server,
	path: string,
	apiKey = "test-token",
	forwardedFor = "203.0.113.0"
): Promise<{ status: number; body: unknown }> {
	return new Promise((resolve, reject) => {
		const addr = server.address();
		if (!addr || typeof addr === "string") {
			reject(new Error("Server not listening"));
			return;
		}
		const req = http.get(
			{
				hostname: "localhost",
				port: addr.port,
				path,
				headers: {
					[HTTP_HEADERS.X_API_KEY]: apiKey,
					"X-Forwarded-For": forwardedFor,
					Connection: "close",
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
		req.end();
	});
}

describe("API Gateway — Rate Limiting Integration", () => {
	let server: http.Server;

	afterEach(() => {
		return new Promise<void>((resolve) => {
			if (server?.listening) {
				server.closeAllConnections();
				server.close(() => resolve());
			} else {
				resolve();
			}
		});
	});

	it("should allow requests within the limit and reject over it with 429", async () => {
		const app = createApp();
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => resolve());
		});
		const path = "/v1/audit-logger/events";

		const first = await request(server, path);
		expect(first.status).toBe(200);

		const second = await request(server, path);
		expect(second.status).toBe(200);

		const third = await request(server, path);
		expect(third.status).toBe(429);
		expect(third.body).toMatchObject({ error: "Too many requests" });
	});

	it("should count each API client separately (all share the edge proxy address)", async () => {
		const app = createApp();
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => resolve());
		});
		const path = "/v1/audit-logger/events";

		await request(server, path);
		await request(server, path);
		expect((await request(server, path)).status).toBe(429);

		expect((await request(server, path, "other-token")).status).toBe(200);
	});

	it("should answer 429 to invalid keys over the limit without blocking a valid client", async () => {
		const app = createApp();
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => resolve());
		});
		const path = "/v1/audit-logger/events";

		expect((await request(server, path, "bad")).status).toBe(401);
		expect((await request(server, path, "bad")).status).toBe(401);
		expect((await request(server, path, "bad")).status).toBe(429);
		expect(
			(await request(server, path, "test-token", "198.51.100.0")).status
		).toBe(200);
	});
});
