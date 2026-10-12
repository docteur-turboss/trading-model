import { describe, expect, it } from "@jest/globals";
import { LogLevel } from "@trading-model/http/infrastructure/log-types";
import { generateProcessId } from "@trading-model/http/infrastructure/process-id-generator";

describe("generateProcessId", () => {
	it("should generate a process ID containing log level", () => {
		const id = generateProcessId(LogLevel.Info);
		expect(id).toContain("info");
	});

	it("should generate a process ID containing date", () => {
		const id = generateProcessId(LogLevel.Error);
		const today = new Date();
		expect(id).toContain(`${today.getFullYear()}.`);
	});

	it("should generate unique IDs", () => {
		const a = generateProcessId(LogLevel.Debug);
		const b = generateProcessId(LogLevel.Debug);
		expect(a).not.toBe(b);
	});
});
