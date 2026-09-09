import http from "node:http";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";

jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: {
		NODE_ENV: "test",
		PORT: 0,
		TLS_KEY_PATH: "",
		TLS_CERT_PATH: "",
		TLS_CA_PATH: "",
		DISCOVERY_SERVICE_URL: "http://localhost:3000",
		RATE_LIMIT_WINDOW_MS: 60000,
		RATE_LIMIT_MAX: 100,
		CACHE_TTL_MS: 30000,
		AUTH_TOKEN_HEADER: "x-api-key",
		AUTH_TOKENS: "test-token",
		PROXY_TIMEOUT_MS: 5000,
	},
}));

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { createRouter } from "../../src/adapters/inbound/router";

function createApp(): express.Application {
	const app = express();
	app.use("/", createRouter());
	return app;
}

function fetchJson(
	server: http.Server,
	path: string
): Promise<{ status: number; body: unknown }> {
	return new Promise((resolve, reject) => {
		const addr = server.address();
		if (!addr || typeof addr === "string") {
			reject(new Error("Server not listening"));
			return;
		}
		const req = http.get(`http://localhost:${addr.port}${path}`, (res) => {
			let data = "";
			res.on("data", (chunk: string) => {
				data += chunk;
			});
			res.on("end", () => {
				try {
					resolve({ status: res.statusCode ?? 500, body: JSON.parse(data) });
				} catch {
					resolve({ status: res.statusCode ?? 500, body: data });
				}
			});
			res.on("error", reject);
		});
		req.on("error", reject);
	});
}

describe("API Gateway — Routes Integration", () => {
	let server: http.Server;

	afterEach(() => {
		jest.restoreAllMocks();
		return new Promise<void>((resolve) => {
			if (server?.listening) {
				server.close(() => resolve());
			} else {
				resolve();
			}
		});
	});

	it("GET /ping should return 200", async () => {
		const app = createApp();
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => resolve());
		});
		const result = await fetchJson(server, "/ping");
		expect(result.status).toBe(200);
		expect(result.body).toHaveProperty("status", "ok");
	});
});
