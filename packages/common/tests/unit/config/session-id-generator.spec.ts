import { describe, expect, it } from "@jest/globals";
import { LogLevel } from "../../../src/config/log-types";
import { generateSessionId } from "../../../src/config/session-id-generator";

describe("generateSessionId", () => {
	it("should generate a session ID containing log level", () => {
		const id = generateSessionId(LogLevel.Info);
		expect(id).toContain("info");
	});

	it("should generate a session ID containing date", () => {
		const id = generateSessionId(LogLevel.Error);
		const today = new Date();
		expect(id).toContain(`${today.getFullYear()}.`);
	});

	it("should generate unique IDs", () => {
		const a = generateSessionId(LogLevel.Debug);
		const b = generateSessionId(LogLevel.Debug);
		expect(a).not.toBe(b);
	});
});
