import { describe, expect, it } from "@jest/globals";
import {
	JobPriority,
	JobStatus,
} from "@trading-model/validation/domain/contracts/recovery.types";

describe("JobPriority", () => {
	it("should have correct constants", () => {
		expect(JobPriority.LOWEST).toBe(1);
		expect(JobPriority.LOW).toBe(2);
		expect(JobPriority.MEDIUM).toBe(3);
		expect(JobPriority.HIGH).toBe(4);
		expect(JobPriority.HIGHEST).toBe(5);
	});
});

describe("JobStatus", () => {
	it("should have correct enum values", () => {
		expect(JobStatus.PENDING).toBe("pending");
		expect(JobStatus.IN_PROGRESS).toBe("in_progress");
		expect(JobStatus.QUEUED).toBe("queued");
		expect(JobStatus.ASSIGNED).toBe("assigned");
		expect(JobStatus.RUNNING).toBe("running");
		expect(JobStatus.COMPLETED).toBe("completed");
		expect(JobStatus.FAILED).toBe("failed");
		expect(JobStatus.CANCELLED).toBe("cancelled");
		expect(JobStatus.ORPHANED).toBe("orphaned");
	});

	it("should list all values", () => {
		const values = JobStatus.values();
		expect(values).toContain(JobStatus.PENDING);
		expect(values).toContain(JobStatus.COMPLETED);
	});

	it("should check terminal status", () => {
		expect(JobStatus.isTerminal(JobStatus.COMPLETED)).toBe(true);
		expect(JobStatus.isTerminal(JobStatus.PENDING)).toBe(false);
	});
});
