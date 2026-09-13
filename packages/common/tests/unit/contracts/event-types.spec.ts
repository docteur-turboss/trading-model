import { describe, expect, it } from "@jest/globals";
import { AuditEvent, MarketEvent } from "../../../src/config/event.types";

describe("event.types", () => {
	it("should re-export MarketEvent and AuditEvent", () => {
		expect(MarketEvent.TestEvent).toBe("example.debug.create");
		expect(AuditEvent.AuditHeartbeat).toBe("audit.heartbeat");
	});

	it("should expose distinct enums", () => {
		expect(MarketEvent).not.toBe(AuditEvent);
	});
});
