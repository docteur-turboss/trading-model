jest.mock("prom-client", () => ({
	register: {
		contentType: "text/plain; charset=utf-8",
		metrics: jest.fn().mockResolvedValue("metrics data"),
	},
}));

import { metricsHandler } from "../src/adapters/inbound/metrics-handler";

describe("metricsHandler", () => {
	it("should be a function", () => {
		expect(typeof metricsHandler).toBe("function");
	});

	it("should set content-type and send metrics", async () => {
		const res = {
			set: jest.fn(),
			send: jest.fn(),
		};

		metricsHandler({} as never, res as never);

		expect(res.set).toHaveBeenCalledWith(
			"Content-Type",
			"text/plain; charset=utf-8"
		);

		await new Promise((r) => setImmediate(r));

		expect(res.send).toHaveBeenCalledWith("metrics data");
	});
});
