import { describe, expect, it } from "@jest/globals";
import { checkEntryAcceptable } from "../../src/application/use-cases/dlq-validator";

describe("dlq-validator", () => {
	it("accepts a payload within limits with storage up", () => {
		expect(checkEntryAcceptable({ foo: "bar" }, true)).toBeNull();
	});

	it("rejects a message exceeding 5MB", () => {
		expect(checkEntryAcceptable("x".repeat(5 * 1024 * 1024 + 1), true)).toBe(
			"too-large"
		);
	});

	it("rejects when storage is unavailable", () => {
		expect(checkEntryAcceptable({ foo: "bar" }, false)).toBe(
			"storage-unavailable"
		);
	});

	it("reports the size before the storage state", () => {
		expect(checkEntryAcceptable("x".repeat(5 * 1024 * 1024 + 1), false)).toBe(
			"too-large"
		);
	});
});
