import { beforeEach, describe, expect, it } from "@jest/globals";

jest.mock("@trading-model/http/adapters/inbound/response-exception", () => ({
	ResponseException: jest.fn((body: any) => ({
		Unauthorized: () => ({ type: "Unauthorized" as const, error: body }),
	})),
}));

jest.mock("@trading-model/validation/domain/validation/primitives", () => ({
	isNonEmptyString: (v: any) => typeof v === "string" && v.trim().length > 0,
}));

import { ResponseException } from "@trading-model/http/adapters/inbound/response-exception";
import { InMemoryTokenStore } from "../../src/adapters/outbound/in-memory-token-store";
import { createServiceRegistry } from "../../src/config/container";
import type { ServiceRegistry } from "../../src/domain/service-registry";
import { validateInstanceToken } from "../../src/shared/helpers";

describe("helpers", () => {
	let registry: ServiceRegistry;

	beforeEach(() => {
		jest.clearAllMocks();
		registry = createServiceRegistry();
	});

	describe("validateInstanceToken", () => {
		it("should throw Unauthorized if token header is missing", async () => {
			await expect(
				validateInstanceToken(registry, null, "instance-1")
			).rejects.toThrow();
			expect(ResponseException).toHaveBeenCalledWith(
				"Missing or invalid instance token"
			);
		});

		it("should throw Unauthorized if token header is empty string", async () => {
			await expect(
				validateInstanceToken(registry, "", "instance-1")
			).rejects.toThrow();
		});

		it("should throw Unauthorized if token is invalid", async () => {
			await expect(
				validateInstanceToken(registry, "invalid-token", "instance-1")
			).rejects.toThrow();
		});

		it("should not throw if token is valid", async () => {
			const registered = await registry.registerInstance({
				serviceName: "financial-scraper-service",
				instanceId: "instance-1",
				ip: "1.1.1.1",
				port: 8080,
				ttl: 30000,
				protocol: "mtls",
				version: "1.0.0",
				registeredAt: Date.now(),
				lastHeartbeat: Date.now(),
			});

			await expect(
				validateInstanceToken(registry, registered.token, "instance-1")
			).resolves.toBeUndefined();
		});

		it("accepts a token issued by another replica sharing the token store", async () => {
			const tokenStore = new InMemoryTokenStore();
			const replicaA = createServiceRegistry({
				signingSecret: "s",
				tokenStore,
			});
			const replicaB = createServiceRegistry({
				signingSecret: "s",
				tokenStore,
			});
			const registered = await replicaA.registerInstance({
				serviceName: "financial-scraper-service",
				instanceId: "instance-1",
				ip: "1.1.1.1",
				port: 8080,
				ttl: 30000,
				protocol: "mtls",
				version: "1.0.0",
				registeredAt: Date.now(),
				lastHeartbeat: Date.now(),
			});

			await expect(
				validateInstanceToken(replicaB, registered.token, "instance-1")
			).resolves.toBeUndefined();
		});
	});
});
