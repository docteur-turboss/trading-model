import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import type { ResolvedEndpoint } from "@trading-model/contracts/wire/service-resolver.types";
import type { Request } from "express";
import {
	proxyAndCache,
	tryServeFromCache,
} from "../../src/application/proxy-dispatcher";
import {
	type ProxyDeps,
	ProxyOverloadedError,
	UpstreamResponseTooLargeError,
	UpstreamTimeoutError,
} from "../../src/domain/ports/gateway.port";

const CTX = {
	serviceName: "svc" as never,
	majorVersion: 1,
	cacheKey: "GET:/x",
	path: "/x",
};
const TARGET = { host: "h", port: 1 } as unknown as ResolvedEndpoint;

function deps(body = '{"a":1}', status = 200) {
	return {
		forward: jest.fn().mockResolvedValue({
			status,
			body,
			headers: { "content-type": "application/json; charset=utf-8" },
		}),
		cache: { get: jest.fn(), set: jest.fn() },
		observeDuration: jest.fn(),
	} satisfies ProxyDeps;
}

describe("proxyAndCache", () => {
	const GET = { method: "GET", headers: {} } as Request;

	it("observes the duration once with the upstream status", async () => {
		const d = deps("{}", 204);
		await proxyAndCache(GET, TARGET, CTX, d);
		expect(d.observeDuration).toHaveBeenCalledTimes(1);
		expect(d.observeDuration).toHaveBeenCalledWith(
			{ service: "svc", status: "204" },
			expect.any(Number)
		);
	});

	it("observes 502 (too large), 503 (other) and 504 (timeout)", async () => {
		const d = deps();
		d.forward.mockRejectedValueOnce(new UpstreamResponseTooLargeError(8));
		await proxyAndCache(GET, TARGET, CTX, d);
		d.forward.mockRejectedValueOnce(new Error("boom"));
		await proxyAndCache(GET, TARGET, CTX, d);
		d.forward.mockRejectedValueOnce(new UpstreamTimeoutError(10));
		await proxyAndCache(GET, TARGET, CTX, d);
		expect(d.observeDuration.mock.calls.map(([labels]) => labels)).toEqual([
			{ service: "svc", status: "502" },
			{ service: "svc", status: "503" },
			{ service: "svc", status: "504" },
		]);
	});

	it("forwards and caches a GET 200", async () => {
		const d = deps();
		const req = { method: "GET", headers: {} } as Request;
		const res = await proxyAndCache(req, TARGET, CTX, d);
		expect(res.status).toBe(HTTP_STATUS.OK);
		expect(res.data).toBe('{"a":1}');
		expect(res.contentType).toBe("application/json; charset=utf-8");
		expect(d.cache.set).toHaveBeenCalledWith("GET:/x", {
			data: '{"a":1}',
			status: 200,
			bytes: 7,
		});
	});

	it("does not cache a POST", async () => {
		const d = deps();
		await proxyAndCache(
			{ method: "POST", headers: {} } as Request,
			TARGET,
			CTX,
			d
		);
		expect(d.cache.set).not.toHaveBeenCalled();
	});

	it("answers 503 when forwarding fails", async () => {
		const d = deps();
		d.forward.mockRejectedValue(new Error("boom"));
		const res = await proxyAndCache(
			{ method: "GET", headers: {} } as Request,
			TARGET,
			CTX,
			d
		);
		expect(res.status).toBe(503);
	});

	it("answers 504 when the upstream deadline is exceeded", async () => {
		const d = deps();
		d.forward.mockRejectedValue(new UpstreamTimeoutError(10));
		const res = await proxyAndCache(GET, TARGET, CTX, d);
		expect(res.status).toBe(HTTP_STATUS.GATEWAY_TIMEOUT);
		expect(res.data).toEqual({ error: "Upstream timeout" });
	});

	it("answers 503 with Retry-After when the proxy is overloaded", async () => {
		const d = deps();
		d.forward.mockRejectedValue(new ProxyOverloadedError(1));
		const res = await proxyAndCache(GET, TARGET, CTX, d);
		expect(res.status).toBe(HTTP_STATUS.SERVICE_UNAVAILABLE);
		expect(res.headers).toEqual({ "Retry-After": "1" });
	});

	it("answers 502 when the upstream answer is too large", async () => {
		const d = deps();
		d.forward.mockRejectedValue(new UpstreamResponseTooLargeError(8));
		const res = await proxyAndCache(
			{ method: "GET", headers: {} } as Request,
			TARGET,
			CTX,
			d
		);
		expect(res.status).toBe(HTTP_STATUS.BAD_GATEWAY);
		expect(res.data).toEqual({ error: "Upstream response too large" });
		expect(d.cache.set).not.toHaveBeenCalled();
	});
});

describe("tryServeFromCache", () => {
	it("serves a hit and skips non-GET", () => {
		const cache = {
			get: jest.fn().mockReturnValue({ data: { a: 1 }, status: 200 }),
			set: jest.fn(),
		};
		const count = jest.fn();
		expect(tryServeFromCache("GET", "k", cache, count)?.status).toBe(200);
		expect(tryServeFromCache("POST", "k", cache, count)).toBeNull();
		cache.get.mockReturnValue(undefined);
		expect(tryServeFromCache("GET", "k", cache, count)).toBeNull();
		expect(count.mock.calls).toEqual([["hit"], ["miss"]]);
	});
});
