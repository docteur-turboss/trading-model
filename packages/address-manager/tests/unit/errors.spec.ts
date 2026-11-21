import { describe, expect, it } from "@jest/globals";
import { addressManagerError } from "../../src/shared/errors";

describe("address-manager errors", () => {
	it("keep the cause", () => {
		const cause = new Error("root");
		expect(addressManagerError("x", { cause }).cause).toBe(cause);
	});
});
