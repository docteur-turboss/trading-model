import { describe, expect, it } from "@jest/globals";
import { DeliveryMode } from "../../src/delivery-mode";

describe("DeliveryMode", () => {
	it("should have AtLeastOnce as its only member", () => {
		expect(Object.values(DeliveryMode)).toEqual(["at-least-once"]);
	});
});
