import { describe, expect, it } from "@jest/globals";
import {
	backpressureError,
	deadLetterError,
	isDeadLetterError,
	isMessageManagerError,
	messageManagerError,
	nackError,
} from "../../src/shared/errors";

describe("broker-message errors", () => {
	it("build errors matched by their own guard only", () => {
		expect(isMessageManagerError(messageManagerError("x"))).toBe(true);
		expect(isDeadLetterError(deadLetterError("x"))).toBe(true);
		expect(isDeadLetterError(nackError("x"))).toBe(false);
		expect(backpressureError("x").httpStatus).toBe(503);
	});

	it("keep reason and cause", () => {
		const cause = new Error("root");
		const e = nackError("x", { reason: "r", cause });
		expect(e.reason).toBe("r");
		expect(e.cause).toBe(cause);
	});
});
