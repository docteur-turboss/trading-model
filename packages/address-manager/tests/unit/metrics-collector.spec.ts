import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.mock("../../src/routes/ping.routes", () => ({
	PING_ROUTES: Symbol("PING_ROUTES"),
}));

jest.mock("../../src/routes/metrics.routes", () => ({
	STATUS_ROUTES: Symbol("STATUS_ROUTES"),
}));

jest.mock("prom-client", () => ({
	register: {
		contentType: "text/plain; charset=utf-8",
		metrics: jest
			.fn<() => Promise<string>>()
			.mockResolvedValue("prometheus metrics"),
	},
}));

import { MetricsCollector } from "../../src/monitoring/metrics-collector";
import { STATUS_ROUTES } from "../../src/routes/metrics.routes";
import { PING_ROUTES } from "../../src/routes/ping.routes";

describe("MetricsCollector", () => {
	let collector: MetricsCollector;
	beforeEach(() => {
		collector = new MetricsCollector();
	});

	describe("constructor", () => {
		test("creates SystemMetrics", () => {
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

	describe("listenExpress", () => {
		test("sets up app locals and routes", () => {
			const app = {
				locals: {} as Record<string, unknown>,
				use: jest.fn<(...args: any[]) => any>(),
				get: jest.fn<(...args: any[]) => any>(),
			};

			collector.listenExpress(app as never);

			expect(typeof app.locals.metricsSnapshot).toBe("function");
			expect(app.use).toHaveBeenCalledWith(PING_ROUTES);
			expect(app.use).toHaveBeenCalledWith(STATUS_ROUTES);
			expect(app.get).toHaveBeenCalledWith("/metrics", expect.any(Function));
		});

		test("metricsSnapshot returns combined system metrics and call tracker snapshot", () => {
			const app = {
				locals: {} as Record<string, unknown>,
				use: jest.fn<(...args: any[]) => any>(),
				get: jest.fn<(...args: any[]) => any>(),
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
			});
		});

		test("prometheus endpoint handler returns metrics", async () => {
			const app = {
				locals: {} as Record<string, unknown>,
				use: jest.fn<(...args: any[]) => any>(),
				get: jest.fn<(...args: any[]) => any>(),
			};

			collector.listenExpress(app as never);

			const handler = app.get.mock.calls[0][1] as (
				_req: unknown,
				res: {
					set: jest.Mock<(...args: any[]) => any>;
					end: jest.Mock<(...args: any[]) => any>;
				}
			) => Promise<void>;
			const res = {
				set: jest.fn<(...args: any[]) => any>(),
				end: jest.fn<(...args: any[]) => any>(),
			};

			await handler({}, res);

			expect(res.set).toHaveBeenCalledWith(
				"Content-Type",
				"text/plain; charset=utf-8"
			);
			expect(res.end).toHaveBeenCalledWith("prometheus metrics");
		});
	});
});
