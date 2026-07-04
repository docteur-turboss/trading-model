import { describe, expect, it } from "@jest/globals";
import { ReplayOrchestrator } from "../../src/domain/replay-orchestrator";

describe("ReplayOrchestrator", () => {
	describe("canProceed", () => {
		it("should return true when circuit is closed", () => {
			const orch = new ReplayOrchestrator();
			expect(orch.canProceed()).toBe(true);
		});

		it("should return false when circuit is open and cooldown has not expired", () => {
			const orch = new ReplayOrchestrator(3, 60000);
			orch.recordResult(false);
			orch.recordResult(false);
			orch.recordResult(false);
			expect(orch.canProceed()).toBe(false);
		});
	});

	describe("recordResult", () => {
		it("should reset failures on success", () => {
			const orch = new ReplayOrchestrator(5, 60000, 2);
			orch.recordResult(false);
			orch.recordResult(true);
			expect(orch.canProceed()).toBe(true);
		});

		it("should open circuit after threshold failures", () => {
			const orch = new ReplayOrchestrator(3, 60000);
			orch.recordResult(false);
			orch.recordResult(false);
			orch.recordResult(false);
			expect(orch.canProceed()).toBe(false);
		});

		it("should re-open circuit during half-open if failures continue", () => {
			const orch = new ReplayOrchestrator(3, 60000, 2);
			orch.recordResult(false);
			orch.recordResult(false);
			orch.recordResult(false);
			expect(orch.canProceed()).toBe(false);
		});
	});

	describe("canStartBatch", () => {
		it("should return true when below max concurrent batches", () => {
			const orch = new ReplayOrchestrator(5, 30000, 2, 2);
			expect(orch.canStartBatch()).toBe(true);
			orch.acquireBatch();
			expect(orch.canStartBatch()).toBe(true);
			orch.acquireBatch();
			expect(orch.canStartBatch()).toBe(false);
		});
	});

	describe("acquireBatch / releaseBatch", () => {
		it("should track active batch count", () => {
			const orch = new ReplayOrchestrator(5, 30000, 2, 2);
			expect(orch.canStartBatch()).toBe(true);
			orch.acquireBatch();
			orch.acquireBatch();
			expect(orch.canStartBatch()).toBe(false);
			orch.releaseBatch();
			expect(orch.canStartBatch()).toBe(true);
		});

		it("should not go below zero on releaseBatch", () => {
			const orch = new ReplayOrchestrator();
			orch.releaseBatch();
			orch.releaseBatch();
			expect(orch.canStartBatch()).toBe(true);
		});
	});

	describe("getCircuitState", () => {
		it("should return closed initially", () => {
			const orch = new ReplayOrchestrator();
			expect(orch.getCircuitState()).toBe("closed");
		});
	});
});
