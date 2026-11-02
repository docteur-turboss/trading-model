import { describe, expect, it } from "@jest/globals";
import { formatLogEntry } from "@trading-model/http/infrastructure/console-formatter";

describe("formatLogEntry", () => {
	const timestamp = new Date("2024-01-15T10:30:00.000Z").getTime();

	it("should format log entry without context", () => {
		const result = formatLogEntry({
			label: "INFO",
			timestamp,
			message: "hello world",
		});
		expect(result).toBe(
			'{"ts":"2024-01-15T10:30:00.000Z","level":"INFO","msg":"hello world"}'
		);
	});

	it("should format log entry with context merged into the JSON record", () => {
		const result = formatLogEntry({
			label: "ERROR",
			timestamp,
			message: "something went wrong",
			context: { error: "timeout", id: 42 },
		});
		expect(result).toBe(
			'{"ts":"2024-01-15T10:30:00.000Z","level":"ERROR","msg":"something went wrong","error":"timeout","id":42}'
		);
	});
});
