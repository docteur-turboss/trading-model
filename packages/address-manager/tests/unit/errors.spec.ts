import { describe, expect, it } from "@jest/globals";
import {
	addressManagerError,
	isAddressManagerError,
	isServiceNotFoundError,
	isServiceUnreachableError,
	serviceNotFoundError,
	serviceUnreachableError,
} from "../../src/shared/errors";

describe("address-manager errors", () => {
	it("build errors matched by their own guard only", () => {
		expect(isAddressManagerError(addressManagerError("x"))).toBe(true);
		expect(isServiceNotFoundError(serviceNotFoundError("x"))).toBe(true);
		expect(isServiceUnreachableError(serviceUnreachableError("x"))).toBe(true);
		expect(isServiceNotFoundError(serviceUnreachableError("x"))).toBe(false);
	});

	it("keep the cause", () => {
		const cause = new Error("root");
		expect(addressManagerError("x", { cause }).cause).toBe(cause);
	});
});
