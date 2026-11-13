import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import {
	type ApiRoute,
	responseIssues,
} from "@trading-model/http/adapters/inbound/api-route/api-route";
import { ResponseProtocol } from "@trading-model/http/adapters/inbound/response-protocol";
import express from "express";

jest.mock("../../src/adapters/inbound/registration-auth", () => ({
	REGISTRATION_MTLS_AUTH: (_req: unknown, _res: unknown, next: () => void) =>
		next(),
}));
jest.mock("../../src/adapters/inbound/registration-ip-allowlist", () => ({
	REGISTRATION_IP_ALLOWLIST: (_req: unknown, _res: unknown, next: () => void) =>
		next(),
}));

import { DISCOVERY_API } from "../../src/adapters/inbound/http/api-routes";
import { HEARTBEAT_ROUTES } from "../../src/adapters/inbound/http/heartbeat.routes";
import { REGISTRY_ROUTES } from "../../src/adapters/inbound/http/register.routes";
import { createServiceRegistry } from "../../src/config/container";
import type { ServiceRegistry } from "../../src/domain/service-registry";

const SERVICE = "financial-scraper";
const REGISTRATION = {
	serviceName: SERVICE,
	instanceId: "scraper-1",
	ip: "10.0.0.7",
	port: 3000,
};

describe("discovery-server internal API (registration and leases)", () => {
	let registry: ServiceRegistry;
	let server: Server;
	let baseUrl: string;

	beforeAll(async () => {
		const app = express();
		app.use(express.json());
		app.use((req, res, next) => REGISTRY_ROUTES(registry)(req, res, next));
		app.use((req, res, next) => HEARTBEAT_ROUTES(registry)(req, res, next));
		// Thrown 401s go through the platform error handler, as in production.
		app.use(ResponseProtocol);
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => resolve());
		});
		baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	afterAll(async () => {
		await new Promise((resolve) => server.close(resolve));
	});

	beforeEach(() => {
		registry = createServiceRegistry();
	});

	/** POST the body, check the response against the route's entry. */
	async function post(
		route: ApiRoute,
		body: unknown,
		headers: Record<string, string> = {}
	) {
		const res = await fetch(`${baseUrl}${route.path}`, {
			method: "POST",
			headers: { "content-type": "application/json", ...headers },
			body: JSON.stringify(body),
		});
		const text = await res.text();
		const parsed = text ? JSON.parse(text) : undefined;
		expect(responseIssues(route, res.status, parsed)).toEqual([]);
		return { status: res.status, body: parsed };
	}

	async function register(): Promise<string> {
		const { status, body } = await post(DISCOVERY_API.register, REGISTRATION);
		expect(status).toBe(201);
		return body.token;
	}

	describe("POST /register", () => {
		it("stores the instance and answers it with its token", async () => {
			const { body } = await post(DISCOVERY_API.register, REGISTRATION);

			expect(body).toMatchObject({
				serviceName: SERVICE,
				instanceId: "scraper-1",
				port: 3000,
				protocol: "mtls",
				token: expect.any(String),
			});
		});

		it.each([
			["a missing port", { ...REGISTRATION, port: undefined }, "body.port"],
			["an invalid IP", { ...REGISTRATION, ip: "not-an-ip" }, "body.ip"],
			[
				"an unknown service",
				{ ...REGISTRATION, serviceName: "unknown" },
				"body.serviceName",
			],
			[
				"an empty instance id",
				{ ...REGISTRATION, instanceId: "" },
				"body.instanceId",
			],
		])("rejects %s with 400", async (_label, payload, field) => {
			const { status, body } = await post(DISCOVERY_API.register, payload);

			expect(status).toBe(400);
			expect(body.details).toEqual(
				expect.arrayContaining([expect.objectContaining({ field })])
			);
		});
	});

	describe("POST /heartbeat", () => {
		const identity = { serviceName: SERVICE, instanceId: "scraper-1" };

		it("renews the lease with the instance token", async () => {
			const token = await register();

			const { status, body } = await post(DISCOVERY_API.heartbeat, identity, {
				"x-instance-token": token,
			});

			expect(status).toBe(200);
			expect(body).toEqual({ ttl: 30_000 });
		});

		it.each([
			["without token", {}, "Missing or invalid instance token"],
			[
				"with a forged token",
				{ "x-instance-token": "forged" },
				"Invalid instance token",
			],
		])("answers 401 %s", async (_label, headers, error) => {
			await register();

			const { status, body } = await post(
				DISCOVERY_API.heartbeat,
				identity,
				headers
			);

			expect(status).toBe(401);
			expect(body).toEqual({ error });
		});

		it("answers 404 when the lease is gone", async () => {
			const token = await register();
			// Lease expired and cleaned while the token is still valid.
			jest
				.spyOn(registry.instanceStore, "updateHeartbeat")
				.mockResolvedValue(false);

			const { status } = await post(DISCOVERY_API.heartbeat, identity, {
				"x-instance-token": token,
			});

			expect(status).toBe(404);
		});

		it("rejects a body without instanceId with 400", async () => {
			const { status } = await post(DISCOVERY_API.heartbeat, {
				serviceName: SERVICE,
			});

			expect(status).toBe(400);
		});
	});

	describe("POST /token/rotate", () => {
		it("replaces the token: the old one stops working", async () => {
			const token = await register();

			const { status, body } = await post(
				DISCOVERY_API.rotateToken,
				{ instanceId: "scraper-1" },
				{ "x-instance-token": token }
			);

			expect(status).toBe(200);
			expect(body.token).not.toBe(token);
			const stale = await post(
				DISCOVERY_API.heartbeat,
				{ serviceName: SERVICE, instanceId: "scraper-1" },
				{ "x-instance-token": token }
			);
			expect(stale.status).toBe(401);
		});
	});

	describe("POST /unregister", () => {
		it("removes the lease with the instance token", async () => {
			const token = await register();

			const { status } = await post(
				DISCOVERY_API.unregister,
				{ serviceName: SERVICE, instanceId: "scraper-1" },
				{ "x-instance-token": token }
			);

			expect(status).toBe(204);
			expect(
				await registry.instanceStore.getInstances(SERVICE as never)
			).toEqual([]);
		});

		it("answers 401 without the token", async () => {
			await register();

			const { status } = await post(DISCOVERY_API.unregister, {
				serviceName: SERVICE,
				instanceId: "scraper-1",
			});

			expect(status).toBe(401);
		});
	});
});
