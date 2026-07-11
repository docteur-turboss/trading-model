import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: {
		info: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
		debug: jest.fn(),
	},
}));

import { CertRenewScheduler } from "../../src/cert-renew-scheduler";
import type { ObtainedCertificate } from "../../src/certificate-client";

describe("CertRenewScheduler", () => {
	let onRenew: jest.Mock<() => Promise<void>>;
	let scheduler: CertRenewScheduler;

	beforeEach(() => {
		jest.clearAllMocks();
		jest.useFakeTimers();
		onRenew = jest
			.fn<() => Promise<void>>()
			.mockResolvedValue(undefined as never);
		scheduler = new CertRenewScheduler("svc-1", 86400000, onRenew);
	});

	afterEach(() => {
		scheduler.stop();
		jest.useRealTimers();
	});

	function makeCert(expiresAt: number): ObtainedCertificate {
		return {
			certPem: "c" as any,
			keyPem: "k" as never,
			caPem: "ca" as any,
			serialNumber: "SN" as any,
			expiresAt: expiresAt as any,
		};
	}

	describe("start", () => {
		it("should schedule renewal when timer is not running", () => {
			scheduler.start();
			expect(jest.getTimerCount()).toBeGreaterThan(0);
		});

		it("should not schedule again if timer is already running", () => {
			scheduler.start();
			const count = jest.getTimerCount();
			scheduler.start();
			expect(jest.getTimerCount()).toBe(count);
		});
	});

	describe("stop", () => {
		it("should stop the renew timer", () => {
			scheduler.start();
			expect(jest.getTimerCount()).toBeGreaterThan(0);
			scheduler.stop();
			expect(jest.getTimerCount()).toBe(0);
		});
	});

	describe("scheduleRenew", () => {
		it("should set up timer for future certificate", async () => {
			const future = Date.now() + 86400000 * 90;
			await scheduler.scheduleRenew(makeCert(future));
			expect(jest.getTimerCount()).toBeGreaterThan(0);
		});

		it("should call onRenew immediately for already-expired certificate", async () => {
			const cert = makeCert(Date.now() - 1000);
			await scheduler.scheduleRenew(cert);
			expect(onRenew).toHaveBeenCalledTimes(1);
		});

		it("should schedule retry after renewal failure", async () => {
			onRenew.mockRejectedValue(new Error("renew failed") as never);
			const cert = makeCert(Date.now() - 1000);
			await scheduler.scheduleRenew(cert);
			expect(onRenew).toHaveBeenCalledTimes(1);
			expect(jest.getTimerCount()).toBeGreaterThan(0);
		});
	});

	describe("_setupTimer callback", () => {
		it("should call _schedule again on successful renewal", async () => {
			const cert = makeCert(Date.now() - 1000);
			await scheduler.scheduleRenew(cert);
			expect(onRenew).toHaveBeenCalledTimes(1);
			const timerCountAfterRetry = jest.getTimerCount();
			expect(timerCountAfterRetry).toBeGreaterThan(0);
		});
	});
});
