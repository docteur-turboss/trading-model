import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { DurationMs } from "@trading-model/primitives/primitives";
import type { ChainAudit } from "../../../src/application/audit-chain/chain-audit";
import { ChainAuditScheduler } from "../../../src/application/audit-chain/chain-audit-scheduler";

function auditWith(runCycle: () => Promise<unknown>): ChainAudit {
	return { runCycle } as unknown as ChainAudit;
}

describe("ChainAuditScheduler", () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	it("runs one cycle at a time", async () => {
		let release: () => void = () => undefined;
		const runCycle = jest.fn(
			() =>
				new Promise<void>((resolve) => {
					release = resolve;
				})
		);
		const scheduler = new ChainAuditScheduler(
			auditWith(runCycle),
			DurationMs.of(1000)
		);

		const first = scheduler.runOnce();
		const second = scheduler.runOnce();
		release();
		await Promise.all([first, second]);
		const third = scheduler.runOnce();
		release();
		await third;

		expect(first).toBe(second);
		expect(runCycle).toHaveBeenCalledTimes(2);
	});

	it("survives a failing cycle", async () => {
		const scheduler = new ChainAuditScheduler(
			auditWith(() => Promise.reject(new Error("mongo down"))),
			DurationMs.of(1000)
		);

		await expect(scheduler.runOnce()).resolves.toBeUndefined();
	});

	it("runs shortly after start, then every interval, until stopped", async () => {
		jest.useFakeTimers();
		const runCycle = jest.fn((..._args: any[]) => Promise.resolve());
		const scheduler = new ChainAuditScheduler(
			auditWith(runCycle),
			DurationMs.of(60_000)
		);

		scheduler.start();
		await jest.advanceTimersByTimeAsync(5000);
		expect(runCycle).toHaveBeenCalledTimes(1);
		await jest.advanceTimersByTimeAsync(60_000);
		expect(runCycle).toHaveBeenCalledTimes(2);

		scheduler.stop();
		await jest.advanceTimersByTimeAsync(120_000);
		expect(runCycle).toHaveBeenCalledTimes(2);
	});
});
