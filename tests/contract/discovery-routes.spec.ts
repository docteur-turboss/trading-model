import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
	type ApiRoute,
	parseRequest,
	responseIssues,
} from "@trading-model/http/adapters/inbound/api-route/api-route";
import { ResponseProtocol } from "@trading-model/http/adapters/inbound/response-protocol";
import {
	toDurationMs,
	toInstanceId,
	toServiceId,
} from "@trading-model/primitives/primitives";
import express from "express";
import { AddressManagerClient } from "../../packages/address-manager/src/adapters/outbound/client/address-manager-client";
import { TokenManager } from "../../packages/address-manager/src/application/client/token-manager";
import { EndpointResolver } from "../../packages/address-manager/src/application/discovery/endpoint-resolver";
import { ServiceResolver } from "../../packages/address-manager/src/application/discovery/service-resolver";
import { DISCOVERY_API } from "../../services/discovery-server/src/adapters/inbound/http/api-routes";
import { HEARTBEAT_ROUTES } from "../../services/discovery-server/src/adapters/inbound/http/heartbeat.routes";
import { REGISTRY_ROUTES } from "../../services/discovery-server/src/adapters/inbound/http/register.routes";
import { createServiceRegistry } from "../../services/discovery-server/src/config/container";

/**
 * Discovery contract: address-manager (in every service) and the gateway's
 * resolver → discovery-server.
 *
 * The real client of address-manager (registration, heartbeat, token
 * rotation, unregistration, lookups) talks over HTTP to the real
 * discovery-server routes. Every request must reach a DISCOVERY_API entry
 * and pass its schema; every answer must match the entry, and the client
 * must act on it (token kept, instance found). The two sides drifted once:
 * the client looked instances up on `/services/:name/region/:region`, a route
 * discovery never had.
 *
 * The caller's identity (mTLS SVID, IP allowlist) is not part of the
 * contract: those middlewares are let through.
 */

// The platform DNS gives the address; the registry only says the version is alive.
jest.mock("node:dns/promises", () => ({
	lookup: jest.fn(async () => ({ address: "127.0.0.1", family: 4 })),
}));

jest.mock(
	"../../services/discovery-server/src/adapters/inbound/registration-auth",
	() => ({
		REGISTRATION_MTLS_AUTH: (_req: unknown, _res: unknown, next: () => void) =>
			next(),
	})
);
jest.mock(
	"../../services/discovery-server/src/adapters/inbound/registration-ip-allowlist",
	() => ({
		REGISTRATION_IP_ALLOWLIST: (
			_req: unknown,
			_res: unknown,
			next: () => void
		) => next(),
	})
);
jest.mock(
	"../../packages/address-manager/src/shared/client/local-ip-detector",
	() => ({
		LocalIPDetector: {
			getIP: () => "10.0.0.7",
			hasChanged: () => false,
			reset: () => undefined,
		},
	})
);

const SERVICE = "financial-scraper";

interface Exchange {
	route: ApiRoute | undefined;
	params: Record<string, string> | undefined;
	method: string;
	path: string;
	headers: Record<string, string>;
	body: unknown;
	status: number;
	response: unknown;
}

/** `/services/:serviceName` → a regex capturing the params. */
function matcher(route: ApiRoute): RegExp {
	const pattern = route.path.replace(/:(\w+)/g, "(?<$1>[^/]+)");
	return new RegExp(`^${pattern}$`);
}

function routeFor(method: string, path: string) {
	for (const route of Object.values(DISCOVERY_API) as ApiRoute[]) {
		const match = route.method === method && matcher(route).exec(path);
		if (match) {
			return { route, params: { ...match.groups } };
		}
	}
}

/**
 * The HttpClient surface address-manager uses, over plain HTTP: JSON body
 * out, parsed body back, an error on a non-2xx status (as the real client).
 */
function recordingHttpClient(exchanges: Exchange[]) {
	const send =
		(method: string) =>
		async (
			url: string,
			bodyOrOptions?: unknown,
			maybeOptions?: { headers?: Record<string, string> }
		) => {
			const body = method === "GET" ? undefined : bodyOrOptions;
			const options = (method === "GET" ? bodyOrOptions : maybeOptions) as
				| { headers?: Record<string, string> }
				| undefined;
			const headers = { ...(options?.headers ?? {}) };
			const res = await fetch(url, {
				method,
				headers: { "content-type": "application/json", ...headers },
				body: body === undefined ? undefined : JSON.stringify(body),
			});
			const text = await res.text();
			const response = text ? JSON.parse(text) : undefined;
			const { pathname } = new URL(url);
			const routed = routeFor(method, pathname);
			exchanges.push({
				route: routed?.route,
				params: routed?.params,
				method,
				path: pathname,
				headers,
				body,
				status: res.status,
				response,
			});
			if (!res.ok) {
				throw new Error(`${method} ${pathname} answered ${res.status}`);
			}
			return response;
		};
	return { get: send("GET"), post: send("POST"), delete: send("DELETE") };
}

describe("discovery contract: address-manager → discovery-server", () => {
	let server: Server;
	let baseUrl: string;
	let exchanges: Exchange[];
	let tokens: TokenManager;
	let client: AddressManagerClient;
	let resolver: ServiceResolver;
	let instanceId: string;

	beforeAll(async () => {
		const registry = createServiceRegistry();
		const app = express();
		app.use(express.json());
		app.use(REGISTRY_ROUTES(registry));
		app.use(HEARTBEAT_ROUTES(registry));
		app.use(ResponseProtocol);
		await new Promise<void>((resolve) => {
			server = app.listen(0, "127.0.0.1", resolve);
		});
		baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	afterAll(async () => {
		await new Promise((resolve) => server.close(resolve));
	});

	beforeEach(() => {
		exchanges = [];
		const http = recordingHttpClient(exchanges) as never;
		instanceId = `scraper-${Date.now()}-${Math.random()}`;
		const config = {
			identity: {
				serviceName: toServiceId(SERVICE),
				instanceId: toInstanceId(instanceId),
			},
			servicePort: 3000,
			addressManagerUrl: baseUrl,
			discoveryUrls: [baseUrl],
			discoveryTimeoutMs: toDurationMs(5000),
		} as never;
		tokens = new TokenManager(http, config);
		client = new AddressManagerClient(http, tokens, config);
		resolver = new ServiceResolver({
			httpClient: http,
			config,
			serviceCache: {
				set: async () => undefined,
				delete: async () => undefined,
			} as never,
			healthChecker: {
				locate: (instance: { host: string }) => instance.host,
				isHealthy: async () => true,
			} as never,
		});
	});

	/** Every exchange reached a route, passed its schema and was answered by it. */
	afterEach(() => {
		for (const exchange of exchanges) {
			const where = `${exchange.method} ${exchange.path}`;
			expect({ where, routed: exchange.route !== undefined }).toEqual({
				where,
				routed: true,
			});
			const route = exchange.route as ApiRoute;
			const parsed = parseRequest(route, {
				body: exchange.body,
				params: exchange.params,
			});
			expect({ where, request: parsed.success }).toEqual({
				where,
				request: true,
			});
			if (route.security?.includes("InstanceToken")) {
				expect({
					where,
					token: Boolean(exchange.headers["x-instance-token"]),
				}).toEqual({ where, token: true });
			}
			expect({
				where,
				issues: responseIssues(route, exchange.status, exchange.response),
			}).toEqual({ where, issues: [] });
		}
	});

	async function registered(): Promise<string> {
		const res = await client.registerService();
		// What the registration handler keeps (registration-attempt-handler).
		tokens.setToken(res?.token as string);
		return res?.token as string;
	}

	it("registration answers the token the client keeps", async () => {
		const token = await registered();

		expect(token).toEqual(expect.any(String));
		expect(exchanges.map((e) => [e.path, e.status])).toEqual([
			["/register", 201],
		]);
	});

	it("heartbeats renew the lease with the registration token", async () => {
		await registered();

		await client.refreshTTL();

		expect(exchanges.map((e) => [e.path, e.status])).toEqual([
			["/register", 201],
			["/heartbeat", 200],
		]);
	});

	it("token rotation answers a token later heartbeats are accepted with", async () => {
		const first = await registered();

		await tokens.refreshToken();
		await client.refreshTTL();

		expect(tokens.getToken()).not.toBe(first);
		expect(exchanges.map((e) => [e.path, e.status])).toEqual([
			["/register", 201],
			["/token/rotate", 200],
			["/heartbeat", 200],
		]);
	});

	it("lookups find the registered instance where it registered", async () => {
		await registered();

		const found = await resolver.findService(toServiceId(SERVICE));
		const all = await resolver.findAllServices(toServiceId(SERVICE));

		expect(found).toMatchObject({ serviceName: SERVICE });
		expect(
			all.find((instance) => instance.instanceId === instanceId)
		).toMatchObject({ host: "127.0.0.1", port: 3000 });
	});

	it("the gateway resolves the canonical name once the registry shows it alive", async () => {
		await registered();
		const gateway = new EndpointResolver(
			`${baseUrl}/`,
			60_000,
			recordingHttpClient(exchanges) as never
		);

		const endpoint = await gateway.resolve(toServiceId("financial-scraper"), 1);

		expect(endpoint).toMatchObject({ host: "127.0.0.1", port: 3000 });
	});

	it("unregistration removes the instance from lookups", async () => {
		await registered();

		await client.unregisterService();
		const all = await resolver.findAllServices(toServiceId(SERVICE));

		expect(exchanges.find((e) => e.path === "/unregister")?.status).toBe(204);
		expect(all.map((instance) => instance.instanceId)).not.toContain(
			instanceId
		);
	});
});
