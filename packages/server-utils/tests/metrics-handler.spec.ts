jest.mock("prom-client", () => ({
	register: {
		contentType: "text/plain; charset=utf-8",
		metrics: jest.fn().mockResolvedValue("metrics data"),
	},
}));

import {
	createMetricsHandler,
	metricsHandler,
} from "../src/adapters/inbound/metrics-handler";

describe("metricsHandler", () => {
	it("should be a function", () => {
		expect(typeof metricsHandler).toBe("function");
	});

	it("should set content-type and send metrics", async () => {
		const res = {
			set: jest.fn(),
			send: jest.fn(),
		};

		metricsHandler({} as never, res as never, jest.fn());

		expect(res.set).toHaveBeenCalledWith(
			"Content-Type",
			"text/plain; charset=utf-8"
		);

		await new Promise((r) => setImmediate(r));

		expect(res.send).toHaveBeenCalledWith("metrics data");
	});
});

describe("createMetricsHandler", () => {
	it("should answer 500 with the message when collecting metrics fails", async () => {
		const registry = {
			contentType: "text/plain",
			metrics: jest.fn().mockRejectedValue(new Error("collect failed")),
		};
		const res = { set: jest.fn(), send: jest.fn(), status: jest.fn() };
		res.status.mockReturnValue(res);

		createMetricsHandler(registry as never)(
			{} as never,
			res as never,
			jest.fn()
		);

		await new Promise((r) => setImmediate(r));

		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.send).toHaveBeenCalledWith("collect failed");
	});
});
