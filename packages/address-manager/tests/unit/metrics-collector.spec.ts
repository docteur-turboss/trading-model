import { beforeEach, describe, expect, jest, test } from "@jest/globals";

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

describe("MetricsCollector", () => {
	let collector: MetricsCollector;
	beforeEach(() => {
		collector = new MetricsCollector();
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
