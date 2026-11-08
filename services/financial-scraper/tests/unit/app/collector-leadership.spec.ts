import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";

jest.mock("@trading-model/contracts/logger-registry", () => ({
	getLogger: () => ({
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	}),
}));

import {
	KubernetesLease,
	type Lease,
	type LeaseApi,
} from "../../../src/adapters/outbound/kubernetes/kubernetes-lease";
import {
	type Collection,
	CollectorLeadership,
	SOLE_INSTANCE_LEASE,
} from "../../../src/application/collector-leadership";
import { COLLECTOR_LEADER } from "../../../src/config/metrics";
import type { LeaderLeasePort } from "../../../src/domain/ports/leader-lease.port";

const TIMING = { retryMs: 2000, renewDeadlineMs: 10_000 };

/** Records start/stop calls and the order of events across instances. */
function fakeCollection(
	events: string[],
	name = "a"
): Collection & {
	active: boolean;
} {
	const collection = {
		active: false,
		start: jest.fn(() => {
			collection.active = true;
			events.push(`${name}:start`);
		}),
		stop: jest.fn(async () => {
			collection.active = false;
			events.push(`${name}:stop`);
		}),
	};
	return collection;
}

function fakeLease(
	events: string[]
): LeaderLeasePort & { held: () => Promise<boolean> } {
	const lease = {
		held: jest.fn<() => Promise<boolean>>(async () => true),
		tryAcquireOrRenew: () => lease.held(),
		release: jest.fn(async () => {
			events.push("release");
		}),
	};
	return lease;
}

async function leaderGauge(): Promise<number> {
	return (await COLLECTOR_LEADER.get()).values[0]?.value ?? -1;
}

/**
 * In-memory Kubernetes API for one Lease: resourceVersion bumped on every
 * write, 409 on a stale resourceVersion, as the API server does.
 */
function memoryLeaseApi(): LeaseApi & { lease: Lease } {
	const store = {
		lease: { metadata: { name: "collector", resourceVersion: "1" } } as Lease,
		async get() {
			return structuredClone(store.lease);
		},
		async update(lease: Lease) {
			if (
				lease.metadata.resourceVersion !== store.lease.metadata.resourceVersion
			) {
				return "conflict" as const;
			}
			const version = String(Number(store.lease.metadata.resourceVersion) + 1);
			store.lease = structuredClone({
				...lease,
				metadata: { ...lease.metadata, resourceVersion: version },
			});
			return structuredClone(store.lease);
		},
	};
	return store;
}

describe("CollectorLeadership", () => {
	beforeEach(() => {
		jest.useFakeTimers({ now: 0 });
	});
	afterEach(() => {
		jest.useRealTimers();
	});

	it("starts no cron while the lease is held by another instance", async () => {
		const events: string[] = [];
		const lease = fakeLease(events);
		lease.held = jest.fn(async () => false);
		const collection = fakeCollection(events);
		const leadership = new CollectorLeadership(lease, collection, TIMING);

		leadership.start();
		await jest.advanceTimersByTimeAsync(30_000);

		expect(collection.start).not.toHaveBeenCalled();
		expect(leadership.leading).toBe(false);
		expect(await leaderGauge()).toBe(0);
		await leadership.stop();
		expect(lease.release).not.toHaveBeenCalled();
	});

	it("starts collecting on acquisition, once, and reports the gauge", async () => {
		const events: string[] = [];
		const collection = fakeCollection(events);
		const leadership = new CollectorLeadership(
			fakeLease(events),
			collection,
			TIMING
		);

		leadership.start();
		await jest.advanceTimersByTimeAsync(10_000);

		expect(collection.start).toHaveBeenCalledTimes(1);
		expect(await leaderGauge()).toBe(1);
		await leadership.stop();
	});

	it("stops collecting when another instance holds the lease", async () => {
		const events: string[] = [];
		const lease = fakeLease(events);
		const collection = fakeCollection(events);
		const leadership = new CollectorLeadership(lease, collection, TIMING);
		leadership.start();
		await jest.advanceTimersByTimeAsync(0);

		lease.held = jest.fn(async () => false);
		await jest.advanceTimersByTimeAsync(TIMING.retryMs);

		expect(collection.stop).toHaveBeenCalledTimes(1);
		expect(leadership.leading).toBe(false);
		expect(await leaderGauge()).toBe(0);
		await leadership.stop();
		expect(lease.release).not.toHaveBeenCalled();
	});

	it("stops collecting once the lease could not be renewed within the deadline", async () => {
		const events: string[] = [];
		const lease = fakeLease(events);
		const collection = fakeCollection(events);
		const leadership = new CollectorLeadership(lease, collection, TIMING);
		leadership.start();
		await jest.advanceTimersByTimeAsync(0);

		lease.held = jest.fn(async () => {
			throw new Error("API server unreachable");
		});
		await jest.advanceTimersByTimeAsync(
			TIMING.renewDeadlineMs - TIMING.retryMs
		);
		expect(collection.stop).not.toHaveBeenCalled();
		await jest.advanceTimersByTimeAsync(TIMING.retryMs);
		expect(collection.stop).toHaveBeenCalledTimes(1);
		await leadership.stop();
	});

	it("on stop drains the collection, then releases the lease", async () => {
		const events: string[] = [];
		const lease = fakeLease(events);
		const leadership = new CollectorLeadership(
			lease,
			fakeCollection(events),
			TIMING
		);
		leadership.start();
		await jest.advanceTimersByTimeAsync(0);

		await leadership.stop();
		await jest.advanceTimersByTimeAsync(10_000);

		expect(events).toEqual(["a:start", "a:stop", "release"]);
		expect(await leaderGauge()).toBe(0);
	});

	it("finishes the shutdown when the release fails", async () => {
		const events: string[] = [];
		const lease = fakeLease(events);
		lease.release = jest.fn(async () => {
			throw new Error("API server unreachable");
		});
		const leadership = new CollectorLeadership(
			lease,
			fakeCollection(events),
			TIMING
		);
		leadership.start();
		await jest.advanceTimersByTimeAsync(0);

		await expect(leadership.stop()).resolves.toBeUndefined();
	});

	it("collects at once without a lease (single instance)", async () => {
		const events: string[] = [];
		const leadership = new CollectorLeadership(
			SOLE_INSTANCE_LEASE,
			fakeCollection(events),
			TIMING
		);
		leadership.start();
		await jest.advanceTimersByTimeAsync(0);
		await leadership.stop();
		expect(events).toEqual(["a:start", "a:stop"]);
	});
});

describe("two collectors on one Kubernetes Lease", () => {
	beforeEach(() => {
		jest.useFakeTimers({ now: 0 });
	});
	afterEach(() => {
		jest.useRealTimers();
	});

	function instance(name: string, api: LeaseApi, events: string[]) {
		const collection = fakeCollection(events, name);
		const leadership = new CollectorLeadership(
			new KubernetesLease(name, api, Date.now),
			collection,
			TIMING
		);
		return { collection, leadership };
	}

	it("never collect at the same time, and hand over on release", async () => {
		const api = memoryLeaseApi();
		const events: string[] = [];
		const a = instance("pod-a", api, events);
		const b = instance("pod-b", api, events);
		let overlaps = 0;
		const check = () => {
			if (a.collection.active && b.collection.active) {
				overlaps++;
			}
		};

		a.leadership.start();
		b.leadership.start();
		for (let t = 0; t < 60_000; t += 500) {
			await jest.advanceTimersByTimeAsync(500);
			check();
		}
		const [first, second] = a.leadership.leading ? [a, b] : [b, a];
		expect(first.leadership.leading).toBe(true);
		expect(second.leadership.leading).toBe(false);

		// Rolling update: the old pod drains and releases, the new one takes over
		// on its next attempt, without waiting for the lease to expire.
		const stopping = first.leadership.stop();
		await jest.advanceTimersByTimeAsync(0);
		await stopping;
		await jest.advanceTimersByTimeAsync(TIMING.retryMs);
		check();
		expect(second.leadership.leading).toBe(true);
		expect(overlaps).toBe(0);
		await second.leadership.stop();
	});

	it("a crashed holder is replaced only after the lease expired, never before", async () => {
		const api = memoryLeaseApi();
		const events: string[] = [];
		// pod-a loses the API server (partition) without releasing.
		let partitioned = false;
		const unreachable = async (): Promise<never> => {
			throw new Error("API server unreachable");
		};
		const aApi: LeaseApi = {
			get: () => (partitioned ? unreachable() : api.get()),
			update: (lease) => (partitioned ? unreachable() : api.update(lease)),
		};
		const a = instance("pod-a", aApi, events);
		a.leadership.start();
		await jest.advanceTimersByTimeAsync(0);
		expect(a.leadership.leading).toBe(true);

		partitioned = true;
		const b = instance("pod-b", api, events);
		b.leadership.start();
		let overlaps = 0;
		let bLeadingAt = -1;
		for (let t = 500; t <= 30_000; t += 500) {
			await jest.advanceTimersByTimeAsync(500);
			if (a.collection.active && b.collection.active) {
				overlaps++;
			}
			if (bLeadingAt < 0 && b.leadership.leading) {
				bLeadingAt = t;
			}
		}
		expect(overlaps).toBe(0);
		expect(a.leadership.leading).toBe(false); // gave up at the renew deadline
		// pod-b waited the lease duration (15 s) from when it first saw the lease.
		expect(bLeadingAt).toBeGreaterThanOrEqual(15_000);
		expect(bLeadingAt).toBeLessThanOrEqual(15_000 + TIMING.retryMs);
		await a.leadership.stop();
		await b.leadership.stop();
	});
});
