import { describe, expect, it } from "@jest/globals";
import {
	addressManagerError,
	isAddressManagerError,
} from "../../src/shared/errors";

describe("address-manager errors", () => {
	it("build errors matched by their own guard only", () => {
		expect(isAddressManagerError(addressManagerError("x"))).toBe(true);
		expect(isAddressManagerError(new Error("x"))).toBe(false);
	});

	it("keep the cause", () => {
		const cause = new Error("root");
		expect(addressManagerError("x", { cause }).cause).toBe(cause);
	});
});
