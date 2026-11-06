import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createReq } from "../helpers/express";

// The mTLS discovery client loads the SVID files at construction.
jest.mock("../../src/config/container", () => ({
	discoveryClient: { get: jest.fn() },
}));

jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: {
		DISCOVERY_SERVICE_URL: "https://discovery:3000",
		AUTH_TOKEN_HEADER: "x-api-key",
		AUTH_TOKENS: "",
		RATE_LIMIT_WINDOW_MS: 60000,
		RATE_LIMIT_MAX: 1000,
		CACHE_TTL_MS: 5000,
		PROXY_TIMEOUT_MS: 5000,
		ALLOWED_PROXY_CIDRS: "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.0/8",
	},
}));

jest.mock("@trading-model/http/adapters/inbound/catch-error", () => ({
	catchSync: (fn: any) => fn,
}));

jest.mock("@trading-model/http/adapters/inbound/response-exception", () => {
	const sendResponse = jest.fn((data: any, status: number) => ({
		status,
		data,
	}));
	return { sendResponse };
});

jest.mock("@trading-model/http/infrastructure/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../src/adapters/outbound/service-resolver", () => ({
	ServiceResolver: jest.fn().mockImplementation(() => ({
		resolve: jest.fn().mockImplementation((name: string) => {
			// No trader-trainer instance is registered.
			if (name === "trader-trainer") {
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

		function get(path: string, method = "GET") {
			return getHandler()(createReq({ method, path, url: path }));
		}

		it("should return 404 for a route the gateway does not expose", async () => {
			const {
				forwardRequest,
			} = require("../../src/adapters/outbound/proxy-handler");
			for (const [method, path] of [
				["GET", "/v1/unknown-service/path"],
				["POST", "/v1/discovery-server/register"],
				["POST", "/v1/discovery-server/heartbeat"],
				["POST", "/v1/message-manager/message"],
				["DELETE", "/v1/message-manager/subscribe"],
				["POST", "/v1/financial-scraper/candles/symbols/BTCUSDT"],
			]) {
				expect(await get(path, method)).toEqual({
					status: 404,
					data: { error: "Route not found" },
				});
			}
			expect(forwardRequest).not.toHaveBeenCalled();
		});

		it("should return 404 when no instance of the service is registered", async () => {
			expect(await get("/v1/trader-trainer/training-status")).toEqual({
				status: 404,
				data: {
					error: "Service not found",
					service: "trader-trainer",
					version: 1,
				},
			});
		});

		/** A GET with a query string: Express leaves it out of `req.path` only. */
		function getUrl(url: string) {
			return getHandler()(
				createReq({ method: "GET", path: url.split("?")[0], url })
			);
		}

		it("should forward the query string with the path", async () => {
			mockForwardSuccess({ data: "ok" });
			const {
				forwardRequest,
			} = require("../../src/adapters/outbound/proxy-handler");

			await getUrl(
				"/v1/financial-scraper/signals/assets/BTC?from=2026-11-01&to=2026-11-02"
			);

			expect(forwardRequest).toHaveBeenCalledWith(
				expect.objectContaining({
					path: "/signals/assets/BTC?from=2026-11-01&to=2026-11-02",
				})
			);
		});

		it("should not serve a cached answer to another query of the same path", async () => {
			mockForwardSuccess({ page: 1 });
			await getUrl("/v1/audit-logger/events?page=1");

			mockForwardSuccess({ page: 2 });

			expect(await getUrl("/v1/audit-logger/events?page=2")).toEqual({
				status: 200,
				data: { page: 2 },
			});
		});

		it("does not cache a signed answer for other callers", async () => {
			mockForwardSuccess({ entries: ["signed"] });
			const url = "/v1/dlq-service/dlq";
			await getHandler()(
				createReq({
					method: "GET",
					path: url,
					url,
					headers: { "x-signature": "sig" },
				})
			);

			mockForwardSuccess({ error: "unsigned" });

			expect(await get(url)).toEqual({
				status: 200,
				data: { error: "unsigned" },
			});
		});

		it("should cache and return cached response on subsequent GET", async () => {
			mockForwardSuccess({ data: "ok" });
			const path = "/v1/audit-logger/events/cached-test";

			const first = await get(path);
			expect(first).toEqual({ status: 200, data: { data: "ok" } });

			mockForwardSuccess({ data: "should-not-reach" });

			const second = await get(path);
			expect(second).toEqual({ status: 200, data: { data: "ok" } });
		});

		it("should return 503 on proxy error without the cause", async () => {
			const {
				forwardRequest,
			} = require("../../src/adapters/outbound/proxy-handler");
			forwardRequest.mockReset();
			forwardRequest.mockRejectedValue(new Error("connect ECONNREFUSED"));

			expect(await get("/v1/audit-logger/events/error-path")).toEqual({
				status: 503,
				data: { error: "Service unavailable" },
			});
		});

		it("should handle POST requests (no cache)", async () => {
			mockForwardSuccess({ saved: true });

			const result = await getHandler()(
				createReq({
					method: "POST",
					path: "/v1/dlq-service/dlq",
					url: "/v1/dlq-service/dlq",
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

			expect(await get("/v1/audit-logger/events/plain-text")).toEqual({
				status: 200,
				data: "plain text response",
			});
		});

		it("should refuse a service path with no route (match[3] undefined)", async () => {
			expect(await get("/v1/audit-logger")).toEqual({
				status: 404,
				data: { error: "Route not found" },
			});
		});

		it("should handle non-Error proxy exception", async () => {
			const {
				forwardRequest,
			} = require("../../src/adapters/outbound/proxy-handler");
			forwardRequest.mockReset();
			forwardRequest.mockRejectedValue("string error");

			expect(await get("/v1/audit-logger/events/bad")).toEqual({
				status: 503,
				data: { error: "Service unavailable" },
			});
		});
	});
});
