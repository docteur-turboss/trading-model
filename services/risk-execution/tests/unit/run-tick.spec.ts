import { describe, expect, it, jest } from "@jest/globals";
import { runTick } from "../../src/config/run-tick";

describe("runTick", () => {
	it("republishes the gauges and reports the failure when the tick throws", async () => {
		const publish = jest.fn<() => void>();
		const onFailure = jest.fn<(error: unknown) => void>();
		const error = new Error("ENOSPC");

		await runTick(() => Promise.reject(error), publish, onFailure);

		expect(onFailure).toHaveBeenCalledWith(error);
		expect(publish).toHaveBeenCalledTimes(1);
	});

	it("publishes without reporting when the tick succeeds", async () => {
		const publish = jest.fn<() => void>();
		const onFailure = jest.fn<(error: unknown) => void>();

		await runTick(() => Promise.resolve(), publish, onFailure);

		expect(onFailure).not.toHaveBeenCalled();
		expect(publish).toHaveBeenCalledTimes(1);
	});
});
