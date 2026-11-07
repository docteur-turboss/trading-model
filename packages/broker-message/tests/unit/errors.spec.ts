import { describe, expect, it } from "@jest/globals";
import {
	deadLetterError,
	isDeadLetterError,
	messageManagerError,
} from "../../src/shared/errors";

describe("broker-message errors", () => {
	it("build errors matched by their own guard only", () => {
		expect(isDeadLetterError(deadLetterError("x"))).toBe(true);
		expect(isDeadLetterError(messageManagerError("x"))).toBe(false);
		expect(messageManagerError("x").httpStatus).toBe(503);
	});

	it("keep reason and cause", () => {
		const cause = new Error("root");
		const e = deadLetterError("x", { reason: "r", cause });
		expect(e.reason).toBe("r");
		expect(e.cause).toBe(cause);
	});
});
