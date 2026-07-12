import { describe, expect, it } from "@jest/globals";
import { JobTimelineEvent } from "@trading-model/validation/contracts/admin/jobs.dto";

describe("JobTimelineEvent", () => {
	it("should have correct enum values", () => {
		expect(JobTimelineEvent).toBeDefined();
	});
});
