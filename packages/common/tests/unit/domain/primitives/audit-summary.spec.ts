import { describe, expect, it } from "@jest/globals";
import {
	AuditSummary,
	fromAuditSummary,
	toAuditSummary,
} from "../../../../src/domain/primitives/audit-summary";

describe("AuditSummary", () => {
	it("should create a valid audit summary", () => {
		expect(AuditSummary.of("test")).toBe("test");
	});

	it("should throw for empty string", () => {
		expect(() => AuditSummary.of("")).toThrow(RangeError);
	});

	it("should throw for non-string", () => {
		expect(() => AuditSummary.of(123 as never)).toThrow(RangeError);
	});

	it("should convert via toAuditSummary and fromAuditSummary", () => {
		expect(toAuditSummary("test")).toBe("test");
		expect(fromAuditSummary("test" as never)).toBe("test");
	});
});
