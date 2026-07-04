import { describe, expect, it } from "@jest/globals";

import { JOB_STATUS_NON_TERMINAL } from "../../../src/types/job.types";

describe("JOB_STATUS_NON_TERMINAL", () => {
	it("should contain all expected non-terminal statuses", () => {
		expect(JOB_STATUS_NON_TERMINAL).toEqual([
			"pending",
			"queued",
			"assigned",
			"running",
			"orphaned",
		]);
	});

	it("should exclude terminal statuses", () => {
		expect(JOB_STATUS_NON_TERMINAL).not.toContain("completed");
		expect(JOB_STATUS_NON_TERMINAL).not.toContain("failed");
		expect(JOB_STATUS_NON_TERMINAL).not.toContain("cancelled");
	});
});
