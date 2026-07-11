import { describe, expect, it } from "@jest/globals";
import {
	isAtLeast,
	isHigherPriority,
	isLowerPriority,
	isTerminalStatus,
	JOB_STATUS_NON_TERMINAL,
	JOB_STATUS_TERMINAL,
	JobPriority,
	JobStatus,
} from "../../../src/contracts/recovery.types";

describe("JobPriority", () => {
	it("should have correct constants", () => {
		expect(JobPriority.LOWEST).toBe(1);
		expect(JobPriority.LOW).toBe(2);
		expect(JobPriority.MEDIUM).toBe(3);
		expect(JobPriority.HIGH).toBe(4);
		expect(JobPriority.HIGHEST).toBe(5);
	});

	it("should compare priorities", () => {
		expect(JobPriority.isHigherPriority(5 as never, 1 as never)).toBe(true);
		expect(JobPriority.isHigherPriority(1 as never, 5 as never)).toBe(false);
		expect(JobPriority.isLowerPriority(1 as never, 5 as never)).toBe(true);
		expect(JobPriority.isAtLeast(4 as never, 3 as never)).toBe(true);
		expect(JobPriority.isAtLeast(2 as never, 3 as never)).toBe(false);
	});
});

describe("isHigherPriority (deprecated)", () => {
	it("should still work", () => {
		expect(isHigherPriority(5 as never, 1 as never)).toBe(true);
	});
});

describe("isLowerPriority (deprecated)", () => {
	it("should still work", () => {
		expect(isLowerPriority(1 as never, 5 as never)).toBe(true);
	});
});

describe("isAtLeast (deprecated)", () => {
	it("should still work", () => {
		expect(isAtLeast(4 as never, 3 as never)).toBe(true);
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

	it("should list terminal statuses", () => {
		const terminal = JobStatus.terminal();
		expect(terminal).toContain(JobStatus.COMPLETED);
		expect(terminal).toContain(JobStatus.FAILED);
		expect(terminal).toContain(JobStatus.CANCELLED);
	});

	it("should list non-terminal statuses", () => {
		const nonTerminal = JobStatus.nonTerminal();
		expect(nonTerminal).toContain(JobStatus.PENDING);
		expect(nonTerminal).not.toContain(JobStatus.COMPLETED);
	});

	it("should check terminal status", () => {
		expect(JobStatus.isTerminal(JobStatus.COMPLETED)).toBe(true);
		expect(JobStatus.isTerminal(JobStatus.PENDING)).toBe(false);
	});

	it("should check valid transitions", () => {
		expect(JobStatus.canTransition(JobStatus.PENDING, JobStatus.QUEUED)).toBe(
			true
		);
		expect(JobStatus.canTransition(JobStatus.PENDING, JobStatus.RUNNING)).toBe(
			false
		);
	});

	it("should check cancelable statuses", () => {
		expect(JobStatus.canCancel(JobStatus.PENDING)).toBe(true);
		expect(JobStatus.canCancel(JobStatus.COMPLETED)).toBe(false);
	});

	it("should transition valid statuses", () => {
		const event = JobStatus.transition(JobStatus.PENDING, JobStatus.QUEUED);
		expect(event.transition.from).toBe(JobStatus.PENDING);
		expect(event.transition.to).toBe(JobStatus.QUEUED);
	});

	it("should throw on cancel from non-cancelable status", () => {
		expect(() =>
			JobStatus.transition(JobStatus.COMPLETED, JobStatus.CANCELLED)
		).toThrow();
	});

	it("should throw on invalid transition", () => {
		expect(() =>
			JobStatus.transition(JobStatus.PENDING, JobStatus.RUNNING)
		).toThrow();
	});
});

describe("JOB_STATUS_TERMINAL (deprecated)", () => {
	it("should have terminal statuses", () => {
		expect(JOB_STATUS_TERMINAL.length).toBeGreaterThan(0);
	});
});

describe("JOB_STATUS_NON_TERMINAL (deprecated)", () => {
	it("should have non-terminal statuses", () => {
		expect(JOB_STATUS_NON_TERMINAL.length).toBeGreaterThan(0);
	});
});

describe("isTerminalStatus (deprecated)", () => {
	it("should still work", () => {
		expect(isTerminalStatus(JobStatus.COMPLETED)).toBe(true);
	});
});
