import { describe, expect, it, jest } from "@jest/globals";
import { metricsHandler } from "@trading-model/server-utils/adapters/inbound/metrics-handler";

describe("metricsHandler", () => {
	it("should set content type", async () => {
		const set = jest.fn<(...args: string[]) => void>();
		const send = jest.fn<(data: string) => void>();
		const res = { set, send } as never;

		metricsHandler({} as never, res);

		expect(set).toHaveBeenCalledWith("Content-Type", expect.any(String));
	});

	it("should send metrics data", async () => {
		const set = jest.fn<(...args: string[]) => void>();
		const send = jest.fn<(data: string) => void>();
		const res = { set, send } as never;

		metricsHandler({} as never, res);
		await new Promise(process.nextTick);
		expect(send).toHaveBeenCalled();
	});
});
