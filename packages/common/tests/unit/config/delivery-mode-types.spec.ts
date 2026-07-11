import { describe, expect, it } from "@jest/globals";
import { DeliveryMode } from "../../../src/config/delivery-mode.types";

describe("DeliveryMode", () => {
	it("should have AtMostOnce with value at-most-once", () => {
		expect(DeliveryMode.AtMostOnce).toBe("at-most-once");
	});

	it("should have AtLeastOnce with value at-least-once", () => {
		expect(DeliveryMode.AtLeastOnce).toBe("at-least-once");
	});

	it("should have ExactlyOnce with value exactly-once", () => {
		expect(DeliveryMode.ExactlyOnce).toBe("exactly-once");
	});

	it("should contain exactly three members", () => {
		const keys = Object.keys(DeliveryMode).filter(
			(k) => typeof DeliveryMode[k as keyof typeof DeliveryMode] === "string"
		);
		expect(keys).toHaveLength(3);
	});

	it("should not allow invalid delivery mode values", () => {
		const valid = Object.values(DeliveryMode) as string[];
		expect(valid).toContain("at-most-once");
		expect(valid).toContain("at-least-once");
		expect(valid).toContain("exactly-once");
		expect(valid).not.toContain("unknown-mode");
	});
});
