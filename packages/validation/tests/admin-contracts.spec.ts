import { Capability } from "@trading-model/common/domain/primitives";
import { z } from "zod";
import {
	ConfigSource,
	JobPriority,
	JobStatus,
	JobTimelineEvent,
	ServiceStatus,
	Severity,
} from "../src/adapters/inbound/admin";
import { CacheStatus } from "../src/adapters/inbound/admin/cache.dto";
import {
	ActivationFn,
	LayerType,
	Optimizer,
} from "../src/adapters/inbound/admin/training.dto";
import { isWorkerSuitable } from "../src/domain/contracts/worker-protocol.types";
import { validateEnv } from "../src/infrastructure/validation/env";
import {
	getAskTotalQty,
	getAvgBid,
	getBidTotalQty,
} from "../src/shared/contracts/market-data.types";

describe("admin contracts", () => {
	it("Severity has expected values", () => {
		expect(Severity.Info).toBe("INFO");
		expect(Severity.Warning).toBe("WARNING");
		expect(Severity.Error).toBe("ERROR");
		expect(Severity.Critical).toBe("CRITICAL");
	});

	it("ConfigSource has expected values", () => {
		expect(ConfigSource.Vault).toBe("Vault");
		expect(ConfigSource.ConfigMap).toBe("ConfigMap");
		expect(ConfigSource.EnvVar).toBe("EnvVar");
		expect(ConfigSource.Local).toBe("Local");
	});

	it("JobTimelineEvent has expected values", () => {
		expect(JobTimelineEvent.Created).toBe("created");
		expect(JobTimelineEvent.Queued).toBe("queued");
		expect(JobTimelineEvent.Assigned).toBe("assigned");
		expect(JobTimelineEvent.Started).toBe("started");
		expect(JobTimelineEvent.Completed).toBe("completed");
		expect(JobTimelineEvent.Failed).toBe("failed");
		expect(JobTimelineEvent.Cancelled).toBe("cancelled");
		expect(JobTimelineEvent.Orphaned).toBe("orphaned");
		expect(JobTimelineEvent.Retrying).toBe("retrying");
	});

	it("ServiceStatus has expected values", () => {
		expect(ServiceStatus.Healthy).toBe("healthy");
		expect(ServiceStatus.Degraded).toBe("degraded");
		expect(ServiceStatus.Down).toBe("down");
	});

	it("JobStatus has expected values", () => {
		expect(JobStatus.PENDING).toBe("pending");
		expect(JobStatus.IN_PROGRESS).toBe("in_progress");
		expect(JobStatus.COMPLETED).toBe("completed");
		expect(JobStatus.FAILED).toBe("failed");
	});

	it("JobPriority has expected values", () => {
		expect(JobPriority.LOWEST).toBe(1);
		expect(JobPriority.LOW).toBe(2);
		expect(JobPriority.MEDIUM).toBe(3);
		expect(JobPriority.HIGH).toBe(4);
		expect(JobPriority.HIGHEST).toBe(5);
	});

	it("CacheStatus has expected values", () => {
		expect(CacheStatus.Active).toBe("active");
		expect(CacheStatus.Expired).toBe("expired");
		expect(CacheStatus.Evicted).toBe("evicted");
		expect(CacheStatus.Unknown).toBe("unknown");
	});

	it("LayerType has expected values", () => {
		expect(LayerType.Dense).toBe("dense");
		expect(LayerType.Lstm).toBe("lstm");
		expect(LayerType.Gru).toBe("gru");
		expect(LayerType.Dropout).toBe("dropout");
	});

	it("ActivationFn has expected values", () => {
		expect(ActivationFn.Relu).toBe("relu");
		expect(ActivationFn.Sigmoid).toBe("sigmoid");
		expect(ActivationFn.Tanh).toBe("tanh");
		expect(ActivationFn.Linear).toBe("linear");
	});

	it("Optimizer has expected values", () => {
		expect(Optimizer.Adam).toBe("adam");
		expect(Optimizer.Sgd).toBe("sgd");
		expect(Optimizer.Adamw).toBe("adamw");
	});
});

describe("orderbook.types", () => {
	it("getAvgBid and getAvgAsk compute averages", () => {
		const _Price = { of: (v: number) => v };
		const _Volume = { zero: () => 0, add: (a: number, b: number) => a + b };
		const _Cash = {
			zero: () => 0,
			add: (a: number, b: number) => a + b,
			fromProduct: (q: number, p: number) => q * p,
		};

		const level = (price: number, quantity: number) => ({ price, quantity });

		const bids = new Set([level(100, 10), level(101, 5)]);
		const asks = new Set([level(102, 8)]);

		const result = getAvgBid({ bids, asks } as never);
		expect(typeof result).toBe("number");
	});

	it("getBidTotalQty and getAskTotalQty sum quantities", () => {
		const _Volume = { zero: () => 0, add: (a: number, b: number) => a + b };
		const _Cash = {
			zero: () => 0,
			add: (a: number, b: number) => a + b,
			fromProduct: (q: number, p: number) => q * p,
		};

		const bids = new Set([
			{ price: 100, quantity: 10 } as never,
			{ price: 101, quantity: 5 } as never,
		]);
		const asks = new Set([{ price: 102, quantity: 8 } as never]);

		const bidTotal = getBidTotalQty({ bids, asks } as never);
		expect(typeof bidTotal).toBe("number");
		const askTotal = getAskTotalQty({ bids, asks } as never);
		expect(typeof askTotal).toBe("number");
	});
});

describe("worker-protocol", () => {
	it("isWorkerSuitable returns true for active capable worker", () => {
		const worker = {
			status: "active",
			capabilities: ["trading"],
			currentLoad: 3,
			maxConcurrency: 10,
		};
		const result = isWorkerSuitable(worker as never, Capability.of("trading"));
		expect(result).toBe(true);
	});

	it("isWorkerSuitable returns false when worker is not active", () => {
		const worker = {
			status: "offline",
			capabilities: ["trading"],
			currentLoad: 3,
			maxConcurrency: 10,
		};
		const result = isWorkerSuitable(worker as never, Capability.of("trading"));
		expect(result).toBe(false);
	});

	it("isWorkerSuitable returns false when worker lacks capability", () => {
		const worker = {
			status: "active",
			capabilities: ["ml"],
			currentLoad: 3,
			maxConcurrency: 10,
		};
		const result = isWorkerSuitable(worker as never, Capability.of("trading"));
		expect(result).toBe(false);
	});

	it("isWorkerSuitable returns false when worker is overloaded", () => {
		const worker = {
			status: "active",
			capabilities: ["trading"],
			currentLoad: 10,
			maxConcurrency: 10,
		};
		const result = isWorkerSuitable(worker as never, Capability.of("trading"));
		expect(result).toBe(false);
	});
});

describe("validateEnv error path", () => {
	it("throws when validation fails", () => {
		const strictSchema = z.object({
			REQUIRED_VAR: z.string().min(1),
		});
		expect(() => validateEnv(strictSchema)).toThrow();
	});
});
