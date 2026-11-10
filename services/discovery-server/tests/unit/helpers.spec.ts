import { beforeEach, describe, expect, it } from "@jest/globals";
import type { Protocol } from "@trading-model/contracts/service-registry-types";
import type {
	DurationMs,
	InstanceId,
	IPAddress,
	Port,
	ServiceId,
	UnixTimestamp,
	Version,
} from "@trading-model/primitives/primitives";

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
				validateInstanceToken(
					registry,
					null as unknown as undefined,
					"instance-1" as InstanceId
				)
			).rejects.toThrow();
			expect(ResponseException).toHaveBeenCalledWith(
				"Missing or invalid instance token"
			);
		});

		it("should throw Unauthorized if token header is empty string", async () => {
			await expect(
				validateInstanceToken(registry, "", "instance-1" as InstanceId)
			).rejects.toThrow();
		});

		it("should throw Unauthorized if token is invalid", async () => {
			await expect(
				validateInstanceToken(
					registry,
					"invalid-token",
					"instance-1" as InstanceId
				)
			).rejects.toThrow();
		});

		it("should not throw if token is valid", async () => {
			const registered = await registry.registerInstance({
				serviceName: "financial-scraper-service" as ServiceId,
				instanceId: "instance-1" as InstanceId,
				host: "1.1.1.1" as IPAddress,
				port: 8080 as Port,
				ttl: 30000 as DurationMs,
				protocol: "mtls" as unknown as Protocol,
				version: "1.0.0" as Version,
				registeredAt: Date.now() as UnixTimestamp,
				lastHeartbeat: Date.now() as UnixTimestamp,
			});

			await expect(
				validateInstanceToken(
					registry,
					registered.token,
					"instance-1" as InstanceId
				)
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
				serviceName: "financial-scraper-service" as ServiceId,
				instanceId: "instance-1" as InstanceId,
				host: "1.1.1.1" as IPAddress,
				port: 8080 as Port,
				ttl: 30000 as DurationMs,
				protocol: "mtls" as unknown as Protocol,
				version: "1.0.0" as Version,
				registeredAt: Date.now() as UnixTimestamp,
				lastHeartbeat: Date.now() as UnixTimestamp,
			});

			await expect(
				validateInstanceToken(
					replicaB,
					registered.token,
					"instance-1" as InstanceId
				)
			).resolves.toBeUndefined();
		});
	});
});
