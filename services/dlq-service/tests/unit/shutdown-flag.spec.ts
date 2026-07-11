import { beforeEach, describe, expect, it } from "@jest/globals";
import {
	isShuttingDown,
	setShuttingDown,
} from "../../src/dlq/shared/shutdown-flag";

describe("shutdown-flag", () => {
	beforeEach(() => {
		setShuttingDown(false);
	});

	it("should start as false", () => {
		expect(isShuttingDown()).toBe(false);
	});

	it("should return true after setShuttingDown(true)", () => {
		setShuttingDown(true);
		expect(isShuttingDown()).toBe(true);
	});

	it("should return false after setShuttingDown(true) then setShuttingDown(false)", () => {
		setShuttingDown(true);
		setShuttingDown(false);
		expect(isShuttingDown()).toBe(false);
	});
});
