import { JobPriority, JobStatus } from "../src/contracts/recovery.types";

describe("JobPriority", () => {
	it("has correct constant values", () => {
		expect(JobPriority.LOWEST).toBe(1);
		expect(JobPriority.LOW).toBe(2);
		expect(JobPriority.MEDIUM).toBe(3);
		expect(JobPriority.HIGH).toBe(4);
		expect(JobPriority.HIGHEST).toBe(5);
	});
});

describe("JobStatus", () => {
	it("values() returns all statuses", () => {
		const values = JobStatus.values();
		expect(values).toContain(JobStatus.PENDING);
		expect(values).toContain(JobStatus.IN_PROGRESS);
		expect(values).toContain(JobStatus.QUEUED);
		expect(values).toContain(JobStatus.ASSIGNED);
		expect(values).toContain(JobStatus.RUNNING);
		expect(values).toContain(JobStatus.COMPLETED);
		expect(values).toContain(JobStatus.FAILED);
		expect(values).toContain(JobStatus.CANCELLED);
		expect(values).toContain(JobStatus.ORPHANED);
	});

	describe("isTerminal", () => {
		it("returns true for terminal statuses", () => {
			expect(JobStatus.isTerminal(JobStatus.COMPLETED)).toBe(true);
			expect(JobStatus.isTerminal(JobStatus.FAILED)).toBe(true);
			expect(JobStatus.isTerminal(JobStatus.CANCELLED)).toBe(true);
		});

		it("returns false for non-terminal statuses", () => {
			expect(JobStatus.isTerminal(JobStatus.PENDING)).toBe(false);
			expect(JobStatus.isTerminal(JobStatus.QUEUED)).toBe(false);
			expect(JobStatus.isTerminal(JobStatus.RUNNING)).toBe(false);
		});
	});
});
