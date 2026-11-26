import { describe, expect, it } from "@jest/globals";
import { ServiceInstanceName } from "@trading-model/primitives/service-instance-name";
import { AuditEvent } from "../../src/audit-events";
import { EVENT_SUBSCRIBERS, isExpectedPublisher } from "../../src/event-routes";
import { RiskEvent } from "../../src/risk-events";
import { TrainingEvent } from "../../src/training-events";

describe("isExpectedPublisher", () => {
	it("accepts a listed publisher of a known topic", () => {
		expect(
			isExpectedPublisher(
				TrainingEvent.ModelPublished,
				ServiceInstanceName.TraderTrainerService
			)
		).toBe(true);
	});

	it("rejects a known topic published under another name", () => {
		expect(
			isExpectedPublisher(
				RiskEvent.KillSwitchEngaged,
				ServiceInstanceName.TraderTrainerService
			)
		).toBe(false);
	});

	it("rejects a topic absent from the table", () => {
		expect(isExpectedPublisher("unknown.topic", "anyone")).toBe(false);
	});
});

describe("EVENT_SUBSCRIBERS", () => {
	it("subscribes audit-logger to every audit topic", () => {
		expect(EVENT_SUBSCRIBERS[ServiceInstanceName.AuditLoggerService]).toEqual(
			expect.arrayContaining(Object.values(AuditEvent))
		);
	});
});
