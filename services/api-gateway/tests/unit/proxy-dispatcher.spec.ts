import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import type { ResolvedEndpoint } from "@trading-model/validation/adapters/outbound/service-resolver.types";
import type { Request } from "express";
import type { ProxyDeps } from "../../src/application/ports";
import {
	proxyAndCache,
	tryServeFromCache,
} from "../../src/application/proxy-dispatcher";

const CTX = {
	serviceName: "svc" as never,
	majorVersion: 1,
	cacheKey: "GET:/x",
	path: "/x",
};
const TARGET = { host: "h", port: 1 } as unknown as ResolvedEndpoint;

function deps(body = '{"a":1}', status = 200) {
	return {
		forward: jest.fn().mockResolvedValue({ status, body }),
		cache: { get: jest.fn(), set: jest.fn() },
	} satisfies ProxyDeps;
}

describe("proxyAndCache", () => {
	it("forwards and caches a GET 200", async () => {
		const d = deps();
		const req = { method: "GET", headers: {} } as Request;
		const res = await proxyAndCache(req, TARGET, CTX, d);
		expect(res.status).toBe(HTTP_STATUS.OK);
		expect(d.cache.set).toHaveBeenCalledWith("GET:/x", {
			data: { a: 1 },
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
});

describe("tryServeFromCache", () => {
	it("serves a hit and skips non-GET", () => {
		const cache = {
			get: jest.fn().mockReturnValue({ data: { a: 1 }, status: 200 }),
			set: jest.fn(),
		};
		expect(tryServeFromCache("GET", "k", cache)?.status).toBe(200);
		expect(tryServeFromCache("POST", "k", cache)).toBeNull();
	});
});
