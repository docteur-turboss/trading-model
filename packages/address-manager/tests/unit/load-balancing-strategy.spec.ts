import { describe, expect, it, jest } from "@jest/globals";
import {
	IPAddress,
	Port,
	toDurationMs,
	toInstanceId,
	toServiceId,
	toVersion,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import { Protocol } from "@trading-model/validation/contracts/service-registry.types";
import type { ServiceInstance } from "../../src/client/type";
import {
	createLoadBalancer,
	LeastConnectionsStrategy,
	LoadBalancingStrategyType,
	RandomStrategy,
	RoundRobinStrategy,
} from "../../src/discovery/load-balancing-strategy";

const inst1 = toInstanceId("i-1");
const inst2 = toInstanceId("i-2");
const inst3 = toInstanceId("i-3");

function makeInstance(overrides?: Partial<ServiceInstance>): ServiceInstance {
	return {
		serviceName: toServiceId("svc"),
		instanceId: inst1,
		host: IPAddress.of("127.0.0.1"),
		port: Port.of(8080),
		version: toVersion("1.0.0"),
		ttl: toDurationMs(30000),
		protocol: Protocol.Http,
		registeredAt: UnixTimestamp.now(),
		lastHeartbeat: UnixTimestamp.now(),
		...overrides,
	};
}

describe("RandomStrategy", () => {
	it("should return an instance from the list", () => {
		const strategy = new RandomStrategy();
		const instances = [
			makeInstance({ instanceId: inst2 }),
			makeInstance({ instanceId: inst3 }),
		];
		const selected = strategy.select(instances);
		expect(instances).toContain(selected);
	});
});

describe("RoundRobinStrategy", () => {
	it("should cycle through instances in order", () => {
		const strategy = new RoundRobinStrategy();
		const instances = [
			makeInstance({ instanceId: inst1 }),
			makeInstance({ instanceId: inst2 }),
			makeInstance({ instanceId: inst3 }),
		];
		expect(strategy.select(instances).instanceId).toBe(inst1);
		expect(strategy.select(instances).instanceId).toBe(inst2);
		expect(strategy.select(instances).instanceId).toBe(inst3);
		expect(strategy.select(instances).instanceId).toBe(inst1);
	});

	it("should reset index", () => {
		const strategy = new RoundRobinStrategy();
		const instances = [
			makeInstance({ instanceId: inst1 }),
			makeInstance({ instanceId: inst2 }),
		];
		strategy.select(instances);
		strategy.reset();
		expect(strategy.select(instances).instanceId).toBe(inst1);
	});
});

describe("LeastConnectionsStrategy", () => {
	it("should select the instance with fewest connections", () => {
		const strategy = new LeastConnectionsStrategy();
		const instances = [
			makeInstance({ instanceId: inst1 }),
			makeInstance({ instanceId: inst2 }),
			makeInstance({ instanceId: inst3 }),
		];
		strategy.acquire(inst1);
		strategy.acquire(inst1);
		strategy.acquire(inst2);
		expect(strategy.select(instances).instanceId).toBe(inst3);
	});

	it("should release connections", () => {
		const strategy = new LeastConnectionsStrategy();
		const instances = [
			makeInstance({ instanceId: inst1 }),
			makeInstance({ instanceId: inst2 }),
		];
		strategy.acquire(inst1);
		strategy.acquire(inst1);
		strategy.release(inst1);
		strategy.release(inst1);
		expect(strategy.select(instances).instanceId).toBe(inst1);
	});

	it("should handle release on unknown instance", () => {
		const strategy = new LeastConnectionsStrategy();
		const instances = [makeInstance({ instanceId: inst1 })];
		strategy.release(toInstanceId("unknown"));
		expect(strategy.select(instances).instanceId).toBe(inst1);
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
		strategy.acquire(inst1);
		strategy.release(inst1);
		jest.advanceTimersByTime(60_000);
		jest.useRealTimers();
	});
});

describe("createLoadBalancer", () => {
	it("should return RandomStrategy for 'random'", () => {
		expect(createLoadBalancer(LoadBalancingStrategyType.Random)).toBeInstanceOf(
			RandomStrategy
		);
	});

	it("should return RoundRobinStrategy for 'round-robin'", () => {
		expect(
			createLoadBalancer(LoadBalancingStrategyType.RoundRobin)
		).toBeInstanceOf(RoundRobinStrategy);
	});

	it("should return LeastConnectionsStrategy for 'least-connections'", () => {
		expect(
			createLoadBalancer(LoadBalancingStrategyType.LeastConnections)
		).toBeInstanceOf(LeastConnectionsStrategy);
	});

	it("should default to RoundRobinStrategy for unknown strategy", () => {
		expect(
			createLoadBalancer("unknown" as LoadBalancingStrategyType)
		).toBeInstanceOf(RoundRobinStrategy);
	});
});
