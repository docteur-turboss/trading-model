import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createReq } from "../helpers/express";

const ENV: any = {
	AUTH_TOKEN_HEADER: "x-api-key",
	AUTH_TOKENS: "",
	RATE_LIMIT_WINDOW_MS: 60000,
	RATE_LIMIT_MAX: 1000,
	CACHE_TTL_MS: 5000,
	PROXY_TIMEOUT_MS: 5000,
	ALLOWED_PROXY_CIDRS: "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.0/8",
};

jest.mock("@trading-model/http/catch-error", () => ({
	catchSync: (fn: any) => fn,
}));

jest.mock("@trading-model/http/response-exception", () => {
	const sendResponse = jest.fn((data: any, status: number) => ({
		status,
		data,
	}));
	return { sendResponse };
});

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
				: Promise.resolve({ address: "10.0.1.5", family: 4 })
		),
}));

jest.mock("../../src/adapters/outbound/proxy-handler", () => ({
	forwardRequest: jest.fn<(...args: any[]) => any>().mockResolvedValue({
		status: 200,
		body: JSON.stringify({ data: "ok" }),
		headers: { "content-type": "application/json" },
	}),
}));

jest.mock("../../src/adapters/inbound/rate-limiter", () => ({
	createRateLimiter: () => (_req: any, _res: any, next: () => void) => next(),
	createAuthFailureLimiter: () => (_req: any, _res: any, next: () => void) =>
		next(),
}));

jest.mock("../../src/adapters/inbound/auth", () => ({
	// One handler: the router test finds it in the stack.
	AUTH_MIDDLEWARE: jest.fn((_req: any, _res: any, next: () => void) => next()),
	createAuthMiddleware: () =>
		require("../../src/adapters/inbound/auth").AUTH_MIDDLEWARE,
	// Every scope unless the request sets its own.
	authOf: (req: any) => ({
		apiKeyScopes: req.apiKeyScopes ?? ["read"],
	}),
}));

import { createRouter } from "../../src/adapters/inbound/router";

describe("router", () => {
	let router: ReturnType<typeof createRouter>;

	beforeEach(() => {
		jest.clearAllMocks();
		router = createRouter(ENV);
	});

	it("should have the catch-all middleware", () => {
		const middlewareLayers = router.stack.filter((layer: any) => !layer.route);
		expect(middlewareLayers.length).toBeGreaterThanOrEqual(3);
	});

	it("should have auth middleware mounted", () => {
		const nonRouteLayers = router.stack.filter((layer: any) => !layer.route);

		const authLayer = nonRouteLayers.find(
			(layer: any) =>
				layer.handle ===
				require("../../src/adapters/inbound/auth").AUTH_MIDDLEWARE
		);

		expect(authLayer).toBeDefined();
	});

	describe("catch-all handler", () => {
		let lastRes: { locals: { routeLabel?: string } };

		function getHandler() {
			lastRes = { locals: {} };
			const nonRouteLayers = router.stack.filter((l: any) => !l.route);
			const handle = nonRouteLayers[nonRouteLayers.length - 1]
				.handle as unknown as (req: unknown, res: unknown) => Promise<any>;
			return (req: unknown) => handle(req, lastRes);
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

		it("labels the request with its public route pattern, not the raw path", async () => {
			mockForwardSuccess({ data: "ok" });
			await get("/v1/audit-logger/events/abc-123");
			expect(lastRes.locals.routeLabel).toBe(
				"/v1/audit-logger/events/:messageId"
			);
		});

		it("should return 404 for a route the gateway does not expose", async () => {
			const {
				forwardRequest,
			} = require("../../src/adapters/outbound/proxy-handler");
			for (const [method, path] of [
				["GET", "/v1/unknown-service/path"],
				["POST", "/v1/discovery-server/register"],
				["POST", "/v1/discovery-server/heartbeat"],
				["POST", "/v1/dlq-service/dlq/replay"],
				["POST", "/v1/financial-scraper/candles/symbols/BTCUSDT"],
			]) {
				expect(await get(path, method)).toEqual({
					status: 404,
					data: { error: "Route not found" },
				});
			}
			expect(forwardRequest).not.toHaveBeenCalled();
		});

		it("should return 503 when the service name does not resolve", async () => {
			expect(await get("/v1/trader-trainer/training-status")).toEqual({
				status: 503,
				data: { error: "Service unavailable" },
			});
		});

		it("should return 404 for a major the service does not serve", async () => {
			expect(
				await get("/v1/financial-scraper/candles/symbols/BTCUSDT")
			).toEqual({ status: 404, data: { error: "Route not found" } });
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
				"/v2/financial-scraper/signals/assets/BTC?from=2026-11-01&to=2026-11-02"
			);

			// Release N strips /v<major> for N-1 services (ADR-0072).
			expect(forwardRequest).toHaveBeenCalledWith(
				expect.objectContaining({
					target: { host: "10.0.1.5", port: 3000 },
					path: "/signals/assets/BTC?from=2026-11-01&to=2026-11-02",
				}),
				ENV
			);
		});

		it("should not serve a cached answer to another query of the same path", async () => {
			mockForwardSuccess({ page: 1 });
			await getUrl("/v1/audit-logger/events?page=1");

			mockForwardSuccess({ page: 2 });

			expect(await getUrl("/v1/audit-logger/events?page=2")).toEqual({
				status: 200,
				data: JSON.stringify({ page: 2 }),
				contentType: "application/json",
			});
		});

		it("does not cache a signed answer for other callers", async () => {
			mockForwardSuccess({ entries: ["signed"] });
			const url = "/v1/audit-logger/events";
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
				data: JSON.stringify({ error: "unsigned" }),
				contentType: "application/json",
			});
		});

		it("should cache and return cached response on subsequent GET", async () => {
			mockForwardSuccess({ data: "ok" });
			const path = "/v1/audit-logger/events/cached-test";

			const first = await get(path);
			expect(first).toEqual({
				status: 200,
				data: JSON.stringify({ data: "ok" }),
				contentType: "application/json",
			});

			mockForwardSuccess({ data: "should-not-reach" });

			const second = await get(path);
			expect(second).toEqual({
				status: 200,
				data: JSON.stringify({ data: "ok" }),
			});
		});

		it("serves a cached answer without a DNS lookup", async () => {
			mockForwardSuccess({ data: "ok" });
			const { lookup } = require("node:dns/promises");
			const path = "/v1/audit-logger/events/cached-no-dns";

			await get(path);
			lookup.mockClear();
			await get(path);

			expect(lookup).not.toHaveBeenCalled();
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

		it("refuses a GET to a key without read", async () => {
			const result = await getHandler()(
				createReq({
					method: "GET",
					path: "/v1/audit-logger/events",
					url: "/v1/audit-logger/events",
					apiKeyScopes: [],
				})
			);

			expect(result.status).toBe(403);
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
				contentType: "text/plain",
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
