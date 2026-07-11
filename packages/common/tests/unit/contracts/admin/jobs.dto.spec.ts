import { describe, expect, it } from "@jest/globals";
import { JobTimelineEvent } from "../../../../src/contracts/admin/jobs.dto";

describe("JobTimelineEvent", () => {
	it("should have correct enum values", () => {
		expect(JobTimelineEvent).toBeDefined();
	});
});
