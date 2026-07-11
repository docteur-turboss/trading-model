import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";

import { HeartbeatThrottleManager } from "../../src/core/heartbeat-throttle-manager";

describe("HeartbeatThrottleManager", () => {
	let manager: HeartbeatThrottleManager;

	beforeEach(() => {
		jest.useFakeTimers();
		manager = new HeartbeatThrottleManager();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	describe("onHeartbeatUpdate", () => {
		it("should publish when no previous invalidation exists", async () => {
			const publish = jest.fn().mockResolvedValue(undefined);
			await manager.onHeartbeatUpdate("test-service", publish);
			expect(publish).toHaveBeenCalledWith("test-service");
		});

		it("should publish when enough time has elapsed", async () => {
			const publish = jest.fn().mockResolvedValue(undefined);

			await manager.onHeartbeatUpdate("test-service", publish);
			expect(publish).toHaveBeenCalledTimes(1);

			jest.advanceTimersByTime(5000);

			await manager.onHeartbeatUpdate("test-service", publish);
			expect(publish).toHaveBeenCalledTimes(2);
		});

		it("should throttle when called within the throttle window", async () => {
			const publish = jest.fn().mockResolvedValue(undefined);

			await manager.onHeartbeatUpdate("test-service", publish);
			expect(publish).toHaveBeenCalledTimes(1);

			jest.advanceTimersByTime(1000);

			await manager.onHeartbeatUpdate("test-service", publish);
			expect(publish).toHaveBeenCalledTimes(1);
		});

		it("should throttle independently per service name", async () => {
			const publishA = jest.fn().mockResolvedValue(undefined);
			const publishB = jest.fn().mockResolvedValue(undefined);

			await manager.onHeartbeatUpdate("svc-a", publishA);
			await manager.onHeartbeatUpdate("svc-b", publishB);

			expect(publishA).toHaveBeenCalledTimes(1);
			expect(publishB).toHaveBeenCalledTimes(1);

			jest.advanceTimersByTime(1000);

			await manager.onHeartbeatUpdate("svc-a", publishA);
			expect(publishA).toHaveBeenCalledTimes(1);

			await manager.onHeartbeatUpdate("svc-b", publishB);
			expect(publishB).toHaveBeenCalledTimes(1);
		});

		it("should publish at exact throttle boundary", async () => {
			const publish = jest.fn().mockResolvedValue(undefined);

			await manager.onHeartbeatUpdate("test-service", publish);
			expect(publish).toHaveBeenCalledTimes(1);

			jest.advanceTimersByTime(4999);

			await manager.onHeartbeatUpdate("test-service", publish);
			expect(publish).toHaveBeenCalledTimes(1);

			jest.advanceTimersByTime(1);

			await manager.onHeartbeatUpdate("test-service", publish);
			expect(publish).toHaveBeenCalledTimes(2);
		});

		it("should await publish promise", async () => {
			let resolved = false;
			const publish = jest.fn().mockImplementation(async () => {
				resolved = true;
			});

			await manager.onHeartbeatUpdate("test-service", publish);
			expect(resolved).toBe(true);
		});
	});
});
