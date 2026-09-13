import { describe, expect, it } from "@jest/globals";
import { AuditEvent } from "../../../src/contracts/audit-events";

describe("AuditEvent", () => {
	it("should have correct values", () => {
		expect(AuditEvent.AuditHeartbeat).toBe("audit.heartbeat");
		expect(AuditEvent.AuditGapDetected).toBe("audit.gap.detected");
	});
});
