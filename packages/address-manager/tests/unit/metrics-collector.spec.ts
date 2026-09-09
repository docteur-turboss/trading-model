import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { CircuitState } from "@trading-model/common/domain/circuit-state";
import type {
	ServiceId,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import { HttpMethod } from "@trading-model/validation/adapters/inbound/signed-request";
import {
	CallStatus,
	Endpoint,
} from "../../src/infrastructure/monitoring/service-call-tracker";

jest.mock("../../src/infrastructure/metrics", () => ({
	CIRCUIT_BREAKER_INSTANCES_TOTAL: {
		set: jest.fn<(labels: { state: string }, value: number) => void>(),
	},
	CACHE_ENTRY_COUNT: {
		set: jest.fn<(value: number) => void>(),
	},
}));

jest.mock("../../src/adapters/inbound/routes/ping.routes", () => ({
	PING_ROUTES: Symbol("PING_ROUTES"),
}));

jest.mock("../../src/adapters/inbound/routes/metrics.routes", () => ({
	METRICS_ROUTES: Symbol("METRICS_ROUTES"),
}));

jest.mock("prom-client", () => ({
	register: {
		contentType: "text/plain; charset=utf-8",
		metrics: jest
			.fn<() => Promise<string>>()
			.mockResolvedValue("prometheus metrics"),
	},
}));

import { METRICS_ROUTES } from "../../src/adapters/inbound/routes/metrics.routes";
import { PING_ROUTES } from "../../src/adapters/inbound/routes/ping.routes";
import type { DiscoveryCircuitBreaker } from "../../src/application/discovery/circuit-breaker";
import type { IServiceCache } from "../../src/domain/discovery/service-cache.interface";
import {
	CACHE_ENTRY_COUNT,
	CIRCUIT_BREAKER_INSTANCES_TOTAL,
} from "../../src/infrastructure/metrics";
import { MetricsCollector } from "../../src/infrastructure/monitoring/metrics-collector";
import { ServiceCallTracker } from "../../src/infrastructure/monitoring/service-call-tracker";

describe("MetricsCollector", () => {
	let collector: MetricsCollector;
	let circuitBreaker: jest.Mocked<
		Pick<DiscoveryCircuitBreaker, "getStateSummary">
	>;
	let serviceCache: jest.Mocked<Pick<IServiceCache, "entries">>;

	function createMocks(): void {
		circuitBreaker = {
			getStateSummary: jest
				.fn<() => Record<string, number>>()
				.mockReturnValue({ closed: 1, open: 2, "half-open": 3 }),
		} as unknown as jest.Mocked<
			Pick<DiscoveryCircuitBreaker, "getStateSummary">
		>;

		serviceCache = {
			entries: jest.fn<() => Promise<never[]>>().mockResolvedValue([]),
		} as unknown as jest.Mocked<Pick<IServiceCache, "entries">>;
	}

	beforeEach(() => {
		createMocks();
		collector = new MetricsCollector(
			circuitBreaker as unknown as DiscoveryCircuitBreaker,
			serviceCache as unknown as IServiceCache
		);
	});

	describe("constructor", () => {
		test("creates SystemMetrics and ServiceCallTracker with default maxCallRecords", () => {
			expect(collector.getMetrics()).toMatchObject({
				memory: expect.objectContaining({
					totalBytes: expect.any(Number),
					usedBytes: expect.any(Number),
					usedPercent: expect.any(Number),
					heapUsedBytes: expect.any(Number),
					heapTotalBytes: expect.any(Number),
				}),
				cpu: expect.objectContaining({
					percent: expect.any(Number),
					loadAvg1m: expect.any(Number),
					loadAvg5m: expect.any(Number),
					loadAvg15m: expect.any(Number),
				}),
				uptime: expect.any(Number),
				collectedAt: expect.any(Number),
			});
			expect(collector.getServiceCallTracker()).toBeInstanceOf(
				ServiceCallTracker
			);
		});

		test("creates ServiceCallTracker with custom maxCallRecords", () => {
			const customCollector = new MetricsCollector(
				circuitBreaker as unknown as DiscoveryCircuitBreaker,
				serviceCache as unknown as IServiceCache,
				3
			);
			const tracker = customCollector.getServiceCallTracker();
			for (let i = 0; i < 5; i++) {
				tracker.record({
					targetService: "svc" as unknown as ServiceId,
					endpoint: Endpoint.of("/test"),
					method: HttpMethod.Get,
					timestamp: 0 as unknown as UnixTimestamp,
					durationMs: 10,
					status: CallStatus.Success,
				});
			}
			expect(tracker.getRecords()).toHaveLength(3);
		});
	});

	describe("getMetrics", () => {
		test("returns system metrics payload", () => {
			const result = collector.getMetrics();
			expect(result).toMatchObject({
				memory: {
					totalBytes: expect.any(Number),
					usedBytes: expect.any(Number),
					usedPercent: expect.any(Number),
					heapUsedBytes: expect.any(Number),
					heapTotalBytes: expect.any(Number),
				},
				cpu: {
					percent: expect.any(Number),
					loadAvg1m: expect.any(Number),
					loadAvg5m: expect.any(Number),
					loadAvg15m: expect.any(Number),
				},
				uptime: expect.any(Number),
				collectedAt: expect.any(Number),
			});
		});
	});

	describe("getServiceCallTracker", () => {
		test("returns the ServiceCallTracker instance", () => {
			expect(collector.getServiceCallTracker()).toBeInstanceOf(
				ServiceCallTracker
			);
		});
	});

	describe("collectSaturationMetrics", () => {
		test("calls getStateSummary and entries, sets gauge values", async () => {
			await collector.collectSaturationMetrics();

			expect(circuitBreaker.getStateSummary).toHaveBeenCalledTimes(1);
			expect(CIRCUIT_BREAKER_INSTANCES_TOTAL.set).toHaveBeenCalledWith(
				{ state: "closed" },
				1
			);
			expect(CIRCUIT_BREAKER_INSTANCES_TOTAL.set).toHaveBeenCalledWith(
				{ state: "open" },
				2
			);
			expect(CIRCUIT_BREAKER_INSTANCES_TOTAL.set).toHaveBeenCalledWith(
				{ state: CircuitState.HALF_OPEN },
				3
			);
			expect(serviceCache.entries).toHaveBeenCalledTimes(1);
			expect(CACHE_ENTRY_COUNT.set).toHaveBeenCalledWith(0);
		});
	});

	describe("listenExpress", () => {
		test("sets up app locals and routes", () => {
			const app = {
				locals: {} as Record<string, unknown>,
				use: jest.fn(),
				get: jest.fn(),
			};

			collector.listenExpress(app as never);

			expect(typeof app.locals.metricsSnapshot).toBe("function");
			expect(app.use).toHaveBeenCalledWith(PING_ROUTES);
			expect(app.use).toHaveBeenCalledWith(METRICS_ROUTES);
			expect(app.get).toHaveBeenCalledWith("/prometheus", expect.any(Function));
		});

		test("metricsSnapshot returns combined system metrics and call tracker snapshot", () => {
			const app = {
				locals: {} as Record<string, unknown>,
				use: jest.fn(),
				get: jest.fn(),
			};

			collector.listenExpress(app as never);

			const snapshot = (
				app.locals.metricsSnapshot as () => Record<string, unknown>
			)();
			expect(snapshot).toMatchObject({
				memory: expect.any(Object),
				cpu: expect.any(Object),
				uptime: expect.any(Number),
				collectedAt: expect.any(Number),
				callTracker: expect.objectContaining({
					totalCalls: expect.any(Number),
					callsByService: expect.any(Object),
					callsByEndpoint: expect.any(Object),
					errorsTotal: expect.any(Number),
					avgLatencyMs: expect.any(Number),
					totalBytesSent: expect.any(Number),
					totalBytesReceived: expect.any(Number),
				}),
			});
		});

		test("prometheus endpoint handler returns metrics", async () => {
			const app = {
				locals: {} as Record<string, unknown>,
				use: jest.fn(),
				get: jest.fn(),
			};

			collector.listenExpress(app as never);

			const handler = app.get.mock.calls[0][1] as (
				_req: unknown,
				res: { set: jest.Mock; end: jest.Mock }
			) => Promise<void>;
			const res = { set: jest.fn(), end: jest.fn() };

			await handler({}, res);

			expect(res.set).toHaveBeenCalledWith(
				"Content-Type",
				"text/plain; charset=utf-8"
			);
			expect(res.end).toHaveBeenCalledWith("prometheus metrics");
		});
	});
});
