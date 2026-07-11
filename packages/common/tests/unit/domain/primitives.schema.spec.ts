import { describe, expect, it } from "@jest/globals";
import {
	PriceSchema,
	VolumeSchema,
} from "../../../src/domain/primitives.schema";

describe("PriceSchema", () => {
	it("should transform a number to a Branded price", () => {
		const result = PriceSchema.parse(100.5);
		expect(result).toBe(100.5);
	});

	it("should reject NaN", () => {
		expect(() => PriceSchema.parse(Number.NaN)).toThrow();
	});
});

describe("VolumeSchema", () => {
	it("should transform a number to a Branded volume", () => {
		const result = VolumeSchema.parse(1000);
		expect(result).toBe(1000);
	});

	it("should reject NaN", () => {
		expect(() => VolumeSchema.parse(Number.NaN)).toThrow();
	});
});
