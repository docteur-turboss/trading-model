import { describe, expect, it } from "@jest/globals";
import { formatLogEntry } from "../../../src/config/console-formatter";

describe("formatLogEntry", () => {
	const timestamp = new Date("2024-01-15T10:30:00.000Z").getTime();

	it("should format log entry without context", () => {
		const result = formatLogEntry({
			label: "INFO",
			timestamp,
			message: "hello world",
		});
		expect(result).toBe("[INFO] [2024-01-15T10:30:00.000Z] hello world");
	});

	it("should format log entry with context", () => {
		const result = formatLogEntry({
			label: "ERROR",
			timestamp,
			message: "something went wrong",
			context: { error: "timeout", id: 42 },
		});
		expect(result).toBe(
			'[ERROR] [2024-01-15T10:30:00.000Z] something went wrong {"error":"timeout","id":42}'
		);
	});
});
