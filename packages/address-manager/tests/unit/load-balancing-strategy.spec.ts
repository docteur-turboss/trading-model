import { describe, expect, it, jest } from "@jest/globals";
import type { IPAddress, Port } from "@trading-model/common/domain/primitives";
import type { ServiceInstance } from "../../src/client/type";
import {
	createLoadBalancer,
	LeastConnectionsStrategy,
	RandomStrategy,
	RoundRobinStrategy,
} from "../../src/discovery/load-balancing-strategy";

function makeInstance(overrides?: Partial<ServiceInstance>): ServiceInstance {
	return {
		serviceName: "svc",
		instanceId: "i-1",
		host: "127.0.0.1" as unknown as IPAddress,
		port: 8080 as unknown as Port,
		version: "1.0.0",
		ttl: 30000,
		protocol: "http",
		registeredAt: Date.now(),
		lastHeartbeat: Date.now(),
		...overrides,
	};
}

describe("RandomStrategy", () => {
	it("should return an instance from the list", () => {
		const strategy = new RandomStrategy();
		const instances = [
			makeInstance({ instanceId: "i-1" }),
			makeInstance({ instanceId: "i-2" }),
		];
		const selected = strategy.select(instances);
		expect(instances).toContain(selected);
	});
});

describe("RoundRobinStrategy", () => {
	it("should cycle through instances in order", () => {
		const strategy = new RoundRobinStrategy();
		const instances = [
			makeInstance({ instanceId: "i-1" }),
			makeInstance({ instanceId: "i-2" }),
			makeInstance({ instanceId: "i-3" }),
		];
		expect(strategy.select(instances).instanceId).toBe("i-1");
		expect(strategy.select(instances).instanceId).toBe("i-2");
		expect(strategy.select(instances).instanceId).toBe("i-3");
		expect(strategy.select(instances).instanceId).toBe("i-1");
	});

	it("should reset index", () => {
		const strategy = new RoundRobinStrategy();
		const instances = [
			makeInstance({ instanceId: "i-1" }),
			makeInstance({ instanceId: "i-2" }),
		];
		strategy.select(instances);
		strategy.reset();
		expect(strategy.select(instances).instanceId).toBe("i-1");
	});
});

describe("LeastConnectionsStrategy", () => {
	it("should select the instance with fewest connections", () => {
		const strategy = new LeastConnectionsStrategy();
		const instances = [
			makeInstance({ instanceId: "i-1" }),
			makeInstance({ instanceId: "i-2" }),
			makeInstance({ instanceId: "i-3" }),
		];
		strategy.acquire("i-1");
		strategy.acquire("i-1");
		strategy.acquire("i-2");
		expect(strategy.select(instances).instanceId).toBe("i-3");
	});

	it("should release connections", () => {
		const strategy = new LeastConnectionsStrategy();
		const instances = [
			makeInstance({ instanceId: "i-1" }),
			makeInstance({ instanceId: "i-2" }),
		];
		strategy.acquire("i-1");
		strategy.acquire("i-1");
		strategy.release("i-1");
		strategy.release("i-1");
		expect(strategy.select(instances).instanceId).toBe("i-1");
	});

	it("should handle release on unknown instance", () => {
		const strategy = new LeastConnectionsStrategy();
		const instances = [makeInstance({ instanceId: "i-1" })];
		strategy.release("unknown");
		expect(strategy.select(instances).instanceId).toBe("i-1");
	});

	it("should dispose and clear interval", () => {
		jest.useFakeTimers();
		const strategy = new LeastConnectionsStrategy();
		strategy.dispose();
		jest.useRealTimers();
	});

	it("should sweep stale entries on interval", () => {
		jest.useFakeTimers();
		const strategy = new LeastConnectionsStrategy();
		strategy.acquire("i-1");
		strategy.release("i-1");
		jest.advanceTimersByTime(60_000);
		jest.useRealTimers();
	});
});

describe("createLoadBalancer", () => {
	it("should return RandomStrategy for 'random'", () => {
		expect(createLoadBalancer("random")).toBeInstanceOf(RandomStrategy);
	});

	it("should return RoundRobinStrategy for 'round-robin'", () => {
		expect(createLoadBalancer("round-robin")).toBeInstanceOf(
			RoundRobinStrategy
		);
	});

	it("should return LeastConnectionsStrategy for 'least-connections'", () => {
		expect(createLoadBalancer("least-connections")).toBeInstanceOf(
			LeastConnectionsStrategy
		);
	});

	it("should default to RoundRobinStrategy for unknown strategy", () => {
		expect(
			createLoadBalancer("unknown" as Parameters<typeof createLoadBalancer>[0])
		).toBeInstanceOf(RoundRobinStrategy);
	});
});
