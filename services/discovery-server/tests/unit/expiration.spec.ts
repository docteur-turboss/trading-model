import { afterEach, describe, expect, it } from "@jest/globals";
import type { ServiceInstance } from "@trading-model/contracts/service-registry-types";
import {
	isExpiredInstance,
	markRegistryAvailable,
} from "../../src/domain/expiration";

const instance = { lastHeartbeat: 1_000, ttl: 30_000 } as ServiceInstance;

describe("isExpiredInstance", () => {
	afterEach(() => markRegistryAvailable(0));

	it("expires a lease one TTL (+ 2 s clock skew) after its last heartbeat", () => {
		expect(isExpiredInstance(instance, 33_000)).toBe(false);
		expect(isExpiredInstance(instance, 33_001)).toBe(true);
	});

	it("gives a lease one TTL to renew after the registry came back", () => {
		markRegistryAvailable(60_000);

		expect(isExpiredInstance(instance, 92_000)).toBe(false);
		expect(isExpiredInstance(instance, 92_001)).toBe(true);
	});
});
