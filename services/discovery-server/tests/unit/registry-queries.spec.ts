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
import { REGISTRY_ROUTES } from "../../src/adapters/inbound/http/register.routes";
import { createServiceRegistry } from "../../src/config/container";
import type { ServiceRegistry } from "../../src/domain/service-registry";

/** Registers while the clock reads two minutes ago: the lease (30 s) has expired. */
async function registerExpired(registry: ServiceRegistry, value: never) {
	const now = Date.now();
	const clock = jest.spyOn(Date, "now").mockReturnValue(now - 120_000);
	try {
		await registry.registerInstance(value);
	} finally {
		clock.mockRestore();
	}
}

/** An instance as registration stores it (ServiceInstance contract). */
function instance(serviceName: string, instanceId: string) {
	const lastHeartbeat = Date.now();
	return {
		serviceName,
		instanceId,
		host: "10.0.0.7",
		port: 3000,
		ttl: 30_000,
		protocol: "mtls",
		version: "1.0.0",
		registeredAt: lastHeartbeat,
		lastHeartbeat,
	} as never;
}

describe("discovery-server public API (DISCOVERY_API)", () => {
	let registry: ServiceRegistry;
	let server: Server;
	let baseUrl: string;

	beforeAll(async () => {
		const app = express();
		app.use(express.json());
		app.use((req, res, next) => REGISTRY_ROUTES(registry)(req, res, next));
		await new Promise<void>((resolve) => {
			server = app.listen(0, resolve);
		});
		baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	afterAll(async () => {
		await new Promise((resolve) => server.close(resolve));
	});

	beforeEach(() => {
		registry = createServiceRegistry();
	});

	/** GET the path, check the response against the route's entry. */
	async function get(route: ApiRoute, path: string) {
		const res = await fetch(`${baseUrl}${path}`);
		const body = await res.json();
		expect(responseIssues(route, res.status, body)).toEqual([]);
		return { status: res.status, body };
	}

	it("lists the services with registered instances", async () => {
		await registry.registerInstance(
			instance("financial-scraper-service", "i1")
		);

		const { status, body } = await get(DISCOVERY_API.listServices, "/services");

		expect(status).toBe(200);
		expect(body).toEqual(["financial-scraper-service"]);
	});

	describe("GET /services/:serviceName", () => {
		it("answers the live instances, expired leases left out", async () => {
			await registry.registerInstance(
				instance("financial-scraper-service", "i1")
			);
			await registerExpired(
				registry,
				instance("financial-scraper-service", "i2")
			);

			const { status, body } = await get(
				DISCOVERY_API.getServiceInstances,
				"/services/financial-scraper-service"
			);

			expect(status).toBe(200);
			expect(body.map((i: { instanceId: string }) => i.instanceId)).toEqual([
				"i1",
			]);
		});

		it("answers 404 for an unknown service (it used to be a 500)", async () => {
			const { status, body } = await get(
				DISCOVERY_API.getServiceInstances,
				"/services/unknown-service"
			);

			expect(status).toBe(404);
			expect(body).toEqual({ error: "Unknown service" });
		});

		it("answers 404 when the name does not verify", async () => {
			jest
				.spyOn(registry.tokenManager, "verifyInstanceName")
				.mockReturnValue(false);

			const { status } = await get(
				DISCOVERY_API.getServiceInstances,
				"/services/financial-scraper-service"
			);

			expect(status).toBe(404);
		});
	});

	describe("GET /services/:serviceName/:instanceId", () => {
		it("answers the instance", async () => {
			await registry.registerInstance(
				instance("financial-scraper-service", "i1")
			);

			const { status, body } = await get(
				DISCOVERY_API.getInstance,
				"/services/financial-scraper-service/i1"
			);

			expect(status).toBe(200);
			expect(body).toMatchObject({ instanceId: "i1", host: "10.0.0.7" });
			expect(body).not.toHaveProperty("token");
		});

		it.each([
			[
				"an unknown instance",
				"/services/financial-scraper-service/nope",
				"Instance not found",
			],
			[
				"an instance of another service",
				"/services/dlq-service/i1",
				"Instance not found",
			],
			["an unknown service", "/services/unknown-service/i1", "Unknown service"],
		])("answers 404 for %s", async (_label, path, error) => {
			await registry.registerInstance(
				instance("financial-scraper-service", "i1")
			);

			const { status, body } = await get(DISCOVERY_API.getInstance, path);

			expect(status).toBe(404);
			expect(body).toEqual({ error });
		});

		it("answers 404 for an expired lease", async () => {
			await registerExpired(
				registry,
				instance("financial-scraper-service", "old")
			);

			const { status } = await get(
				DISCOVERY_API.getInstance,
				"/services/financial-scraper-service/old"
			);

			expect(status).toBe(404);
		});
	});
});
