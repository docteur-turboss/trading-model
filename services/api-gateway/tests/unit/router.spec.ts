import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createReq } from "../helpers/express";

jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: {
		DISCOVERY_SERVICE_URL: "https://discovery:3000",
		AUTH_TOKEN_HEADER: "x-api-key",
		AUTH_TOKENS: "",
		RATE_LIMIT_WINDOW_MS: 60000,
		RATE_LIMIT_MAX: 1000,
		CACHE_TTL_MS: 5000,
		PROXY_TIMEOUT_MS: 5000,
	},
}));

jest.mock("@trading-model/common/middleware/catch-error", () => ({
	catchSync: (fn: any) => fn,
}));

jest.mock("@trading-model/common/middleware/response-exception", () => {
	const sendResponse = jest.fn((data: any, status: number) => ({
		status,
		data,
	}));
	return { sendResponse };
});

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../src/adapters/outbound/service-resolver", () => ({
	ServiceResolver: jest.fn().mockImplementation(() => ({
		resolve: jest.fn().mockImplementation((name: string) => {
			if (name === "unknown-service") {
				return Promise.resolve(null);
			}
			return Promise.resolve({
				host: "10.0.1.5",
				port: 3000,
				version: "1.2.0",
			});
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

jest.mock("../../src/adapters/inbound/rate-limiter", () => ({
	DEFAULT_LIMITER: jest.fn((_req: any, _res: any, next: () => void) => next()),
	STRICT_LIMITER: jest.fn((_req: any, _res: any, next: () => void) => next()),
}));

jest.mock("../../src/adapters/inbound/auth", () => ({
	AUTH_MIDDLEWARE: jest.fn((_req: any, _res: any, next: () => void) => next()),
}));

import { createRouter } from "../../src/adapters/inbound/router";

describe("router", () => {
	let router: ReturnType<typeof createRouter>;

	beforeEach(() => {
		jest.clearAllMocks();
		router = createRouter();
	});

	it("should have the catch-all middleware", () => {
		const middlewareLayers = router.stack.filter((layer: any) => !layer.route);
		expect(middlewareLayers.length).toBeGreaterThanOrEqual(3);
	});

	it("should have auth middleware mounted", () => {
		const nonRouteLayers = router.stack.filter((layer: any) => !layer.route);

		const authLayer = nonRouteLayers.find(
			(layer: any) =>
				layer.name === "AUTH_MIDDLEWARE" ||
				layer.handle ===
					require("../../src/adapters/inbound/auth").AUTH_MIDDLEWARE
		);

		expect(authLayer).toBeDefined();
	});

	describe("catch-all handler", () => {
		function getHandler() {
			const nonRouteLayers = router.stack.filter((l: any) => !l.route);
			return nonRouteLayers[nonRouteLayers.length - 1].handle;
		}

		function mockForwardSuccess(body: unknown) {
			const {
				forwardRequest,
			} = require("../../src/adapters/outbound/proxy-handler");
			forwardRequest.mockReset();
			forwardRequest.mockResolvedValue({
				status: 200,
				body: JSON.stringify(body),
				headers: { "content-type": "application/json" },
			});
		}

		it("should return 400 for invalid route format", async () => {
			const handler = getHandler();
			const result = await handler(
				createReq({ method: "GET", path: "/bad-route", url: "/bad-route" })
			);
			expect(result).toEqual({
				status: 400,
				data: {
					error: "Invalid route format. Expected /v{version}/{serviceName}/**",
				},
			});
		});

		it("should return 400 for invalid version number", async () => {
			const handler = getHandler();
			const result = await handler(
				createReq({
					method: "GET",
					path: "/v0/invalid/path",
					url: "/v0/invalid/path",
				})
			);
			expect(result).toEqual({
				status: 400,
				data: { error: "Invalid version number" },
			});
		});

		it("should return 404 when service not found", async () => {
			const handler = getHandler();
			const result = await handler(
				createReq({
					method: "GET",
					path: "/v1/unknown-service/path",
					url: "/v1/unknown-service/path",
				})
			);
			expect(result).toEqual({
				status: 404,
				data: {
					error: "Service not found",
					service: "unknown-service",
					version: 1,
				},
			});
		});

		it("should cache and return cached response on subsequent GET", async () => {
			mockForwardSuccess({ data: "ok" });

			const handler = getHandler();
			const req = createReq({
				method: "GET",
				path: "/v1/sector-allocator/cached-test",
				url: "/v1/sector-allocator/cached-test",
			});

			const first = await handler(req);
			expect(first).toEqual({ status: 200, data: { data: "ok" } });

			mockForwardSuccess({ data: "should-not-reach" });

			const second = await handler(req);
			expect(second).toEqual({ status: 200, data: { data: "ok" } });
		});

		it("should return 503 on proxy error", async () => {
			const {
				forwardRequest,
			} = require("../../src/adapters/outbound/proxy-handler");
			forwardRequest.mockReset();
			forwardRequest.mockRejectedValue(new Error("Connection timeout"));

			const handler = getHandler();
			const req = createReq({
				method: "GET",
				path: "/v1/sector-allocator/error-path",
				url: "/v1/sector-allocator/error-path",
			});
			const result = await handler(req);
			expect(result).toEqual({
				status: 503,
				data: { error: "Service unavailable", details: "Connection timeout" },
			});
		});

		it("should handle POST requests (no cache)", async () => {
			mockForwardSuccess({ saved: true });

			const handler = getHandler();
			const result = await handler(
				createReq({
					method: "POST",
					path: "/v1/sector-allocator/create",
					url: "/v1/sector-allocator/create",
					body: { name: "test" },
				})
			);
			expect(result).toEqual({ status: 200, data: { saved: true } });
		});

		it("should handle non-JSON response body", async () => {
			const {
				forwardRequest,
			} = require("../../src/adapters/outbound/proxy-handler");
			forwardRequest.mockReset();
			forwardRequest.mockResolvedValue({
				status: 200,
				body: "plain text response",
				headers: { "content-type": "text/plain" },
			});

			const handler = getHandler();
			const result = await handler(
				createReq({
					method: "GET",
					path: "/v1/sector-allocator/data",
					url: "/v1/sector-allocator/data",
				})
			);
			expect(result).toEqual({ status: 200, data: "plain text response" });
		});

		it("should handle route with no trailing path (match[3] undefined)", async () => {
			mockForwardSuccess({ ok: true });

			const handler = getHandler();
			const result = await handler(
				createReq({
					method: "GET",
					path: "/v1/sector-allocator",
					url: "/v1/sector-allocator",
				})
			);
			expect(result).toEqual({ status: 200, data: { ok: true } });
		});

		it("should handle non-Error proxy exception", async () => {
			const {
				forwardRequest,
			} = require("../../src/adapters/outbound/proxy-handler");
			forwardRequest.mockReset();
			forwardRequest.mockRejectedValue("string error");

			const handler = getHandler();
			const req = createReq({
				method: "GET",
				path: "/v1/sector-allocator/bad",
				url: "/v1/sector-allocator/bad",
			});
			const result = await handler(req);
			expect(result).toEqual({
				status: 503,
				data: { error: "Service unavailable", details: "Unknown error" },
			});
		});
	});
});
