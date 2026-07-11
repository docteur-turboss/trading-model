import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import type {
	JobId,
	JobType,
	PositiveInt,
} from "../../../src/domain/primitives";
import { JobTracker } from "../../../src/worker/job-tracker";

describe("JobTracker", () => {
	let tracker: JobTracker;

	beforeEach(() => {
		jest.useFakeTimers();
		tracker = new JobTracker();
	});

	afterEach(() => {
		tracker.stopAll();
		jest.useRealTimers();
	});

	it("should start with 0 active count", () => {
		expect(tracker.activeCount).toBe(0);
	});

	it("should track a started job", () => {
		tracker.startJob({
			id: "job-1" as JobId,
			type: "type-a" as JobType,
			ackDeadline: (Date.now() + 1000) as PositiveInt,
			payload: {},
		});
		expect(tracker.activeCount).toBe(1);
	});

	it("should remove job when ended", () => {
		tracker.startJob({
			id: "job-1" as JobId,
			type: "type-a" as JobType,
			ackDeadline: (Date.now() + 1000) as PositiveInt,
			payload: {},
		});
		tracker.endJob("job-1" as JobId);
		expect(tracker.activeCount).toBe(0);
	});

	it("should safely end nonexistent job", () => {
		expect(() => tracker.endJob("nonexistent" as JobId)).not.toThrow();
	});

	it("should stop all jobs", () => {
		tracker.startJob({
			id: "job-1" as JobId,
			type: "type-a" as JobType,
			ackDeadline: (Date.now() + 1000) as PositiveInt,
			payload: {},
		});
		tracker.startJob({
			id: "job-2" as JobId,
			type: "type-b" as JobType,
			ackDeadline: (Date.now() + 2000) as PositiveInt,
			payload: {},
		});
		expect(tracker.activeCount).toBe(2);
		tracker.stopAll();
		expect(tracker.activeCount).toBe(0);
	});
});
