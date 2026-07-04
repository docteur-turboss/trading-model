import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { validRegisterPayload } from "../../fixtures/index";
import { createNext, createReq, createRes } from "../../helpers/express";

jest.mock("@trading-model/common/middleware/catch-error", () => ({
	catchSync:
		(fn: any) =>
		async (...args: any[]) =>
			fn(...args),
}));

jest.mock("@trading-model/common/middleware/response-exception", () => {
	const sendResponse = (data: any, status: number) => ({ status, data });
	const ResponseException = jest.fn((body: any) => ({
		badRequest: () => ({ type: "BadRequest" as const, error: body }),
		notFound: () => ({ type: "NotFound" as const, error: body }),
		ok: () => ({ type: "OK" as const, ...body }),
		success: () => ({ type: "Success" as const, ...body }),
		unauthorized: () => ({ type: "Unauthorized" as const, error: body }),
	}));
	return { sendResponse, ResponseException };
});

import { createRegisterController } from "../../../src/controllers/register.controller";
import { ServiceRegistry } from "../../../src/core/service-registry";

describe("Register.controller", () => {
	let registry: ServiceRegistry;
	let controller: ReturnType<typeof createRegisterController>;

	beforeEach(() => {
		jest.clearAllMocks();
		registry = new ServiceRegistry();
		controller = createRegisterController(registry);
	});

	describe("register", () => {
		it("should reject null body with BadRequest", async () => {
			await expect(
				controller.register(createReq({ body: null }), createRes(), createNext)
			).resolves.toMatchObject({
				status: 400,
				data: { error: "Invalid request body" },
			});
		});

		it("should reject missing serviceName with BadRequest", async () => {
			await expect(
				controller.register(
					createReq({ body: { ip: "1.1.1.1", port: 80 } }),
					createRes(),
					createNext
				)
			).resolves.toMatchObject({
				status: 400,
				data: { error: "Invalid request body" },
			});
		});

		it("should reject invalid service name with BadRequest", async () => {
			const invalidPayload = {
				...validRegisterPayload,
				serviceName: "unknown-service",
			};
			await expect(
				controller.register(
					createReq({ body: invalidPayload }),
					createRes(),
					createNext
				)
			).resolves.toMatchObject({
				status: 400,
				data: { error: "Invalid service name" },
			});
		});

		it("should reject invalid IP with BadRequest", async () => {
			await expect(
				controller.register(
					createReq({ body: { ...validRegisterPayload, ip: "not-an-ip" } }),
					createRes(),
					createNext
				)
			).resolves.toMatchObject({
				status: 400,
				data: { error: "Invalid request body" },
			});
		});

		it("should reject invalid port with BadRequest", async () => {
			await expect(
				controller.register(
					createReq({ body: { ...validRegisterPayload, port: -1 } }),
					createRes(),
					createNext
				)
			).resolves.toMatchObject({
				status: 400,
				data: { error: "Invalid request body" },
			});
		});

		it("should register a new instance and return OK with generated instanceId", async () => {
			await expect(
				controller.register(
					createReq({ body: validRegisterPayload }),
					createRes(),
					createNext
				)
			).resolves.toMatchObject({
				status: 201,
				data: { serviceName: validRegisterPayload.serviceName },
			});
		});

		it("should pass provided instanceId to registry", async () => {
			const body = { ...validRegisterPayload, instanceId: "custom-id" };
			await expect(
				controller.register(createReq({ body }), createRes(), createNext)
			).resolves.toMatchObject({
				status: 201,
				data: { instanceId: "custom-id" },
			});
		});

		it("should reject empty string instanceId with BadRequest", async () => {
			await expect(
				controller.register(
					createReq({ body: { ...validRegisterPayload, instanceId: "" } }),
					createRes(),
					createNext
				)
			).resolves.toMatchObject({
				status: 400,
				data: { error: "Invalid request body" },
			});
		});
	});

	describe("listServices", () => {
		it("should return list of service names", async () => {
			await expect(
				controller.listServices(createReq(), createRes(), createNext)
			).resolves.toMatchObject({ status: 200 });
		});

		it("should return registered service names", async () => {
			registry.registerInstance({
				serviceName: "financial-scraper-service",
				instanceId: "i1",
				ip: "1.1.1.1",
				port: 8080,
				ttl: 30000,
				protocol: "mtls",
				version: "1.0.0",
				registeredAt: Date.now(),
				lastHeartbeat: Date.now(),
			});

			await expect(
				controller.listServices(createReq(), createRes(), createNext)
			).resolves.toMatchObject({ status: 200 });
		});
	});

	describe("getServiceInstances", () => {
		it("should reject missing serviceName with BadRequest", async () => {
			await expect(
				controller.getServiceInstances(
					createReq({ params: {} }),
					createRes(),
					createNext
				)
			).resolves.toMatchObject({ status: 400 });
		});

		it("should reject unknown service name with NotFound", async () => {
			await expect(
				controller.getServiceInstances(
					createReq({ params: { serviceName: "unknown-service" } }),
					createRes(),
					createNext
				)
			).resolves.toMatchObject({
				status: 404,
				data: { error: "Unknown service" },
			});
		});

		it("should return instances for known service", async () => {
			registry.registerInstance({
				serviceName: "financial-scraper-service",
				instanceId: "i1",
				ip: "1.1.1.1",
				port: 8080,
				ttl: 30000,
				protocol: "mtls",
				version: "1.0.0",
				registeredAt: Date.now(),
				lastHeartbeat: Date.now(),
			});

			await expect(
				controller.getServiceInstances(
					createReq({ params: { serviceName: "financial-scraper-service" } }),
					createRes(),
					createNext
				)
			).resolves.toMatchObject({ status: 200 });
		});
	});

	describe("getInstance", () => {
		it("should reject missing params with BadRequest", async () => {
			await expect(
				controller.getInstance(
					createReq({ params: { serviceName: "svc" } }),
					createRes(),
					createNext
				)
			).resolves.toMatchObject({ status: 400 });
		});

		it("should reject unknown instance with NotFound", async () => {
			await expect(
				controller.getInstance(
					createReq({ params: { serviceName: "svc", instanceId: "i1" } }),
					createRes(),
					createNext
				)
			).resolves.toMatchObject({ status: 404 });
		});

		it("should return instance when found", async () => {
			registry.registerInstance({
				serviceName: "financial-scraper-service",
				instanceId: "i1",
				ip: "1.1.1.1",
				port: 8080,
				ttl: 30000,
				protocol: "mtls",
				version: "1.0.0",
				registeredAt: Date.now(),
				lastHeartbeat: Date.now(),
			});

			await expect(
				controller.getInstance(
					createReq({
						params: {
							serviceName: "financial-scraper-service",
							instanceId: "i1",
						},
					}),
					createRes(),
					createNext
				)
			).resolves.toMatchObject({ status: 200 });
		});
	});
});
