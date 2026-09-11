import http from "node:http";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
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
		RATE_LIMIT_MAX: 2,
		CACHE_TTL_MS: 30000,
		AUTH_TOKEN_HEADER: "x-api-key",
		AUTH_TOKENS: "test-token",
		PROXY_TIMEOUT_MS: 5000,
	},
}));

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../src/adapters/outbound/service-resolver", () => ({
	ServiceResolver: jest.fn().mockImplementation(() => ({
		resolve: jest.fn().mockResolvedValue({
			host: "10.0.0.5",
			port: 3000,
			version: "1.2.0",
		}),
	})),
}));

jest.mock("../../src/adapters/outbound/proxy-handler", () => ({
	forwardRequest: jest.fn().mockResolvedValue({
		status: 200,
		body: JSON.stringify({ data: "ok" }),
		headers: { "content-type": "application/json" },
	}),
}));

import { createRouter } from "../../src/adapters/inbound/router";

function createApp(): express.Application {
	const app = express();
	app.use(express.json());
	app.use("/", createRouter());
	return app;
}

function request(
	server: http.Server,
	path: string
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
					[HTTP_HEADERS.X_API_KEY]: "test-token",
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
		const path = "/v1/discovery-server/services";

		const first = await request(server, path);
		expect(first.status).toBe(200);

		const second = await request(server, path);
		expect(second.status).toBe(200);

		const third = await request(server, path);
		expect(third.status).toBe(429);
		expect(third.body).toMatchObject({ error: "Too many requests" });
	});

	it("should not rate-limit the unauthenticated ping endpoint", async () => {
		const app = createApp();
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => resolve());
		});
		const result = await request(server, "/ping");
		expect(result.status).toBe(200);
	});
});
