import { describe, expect, it } from "@jest/globals";
import { Fitness } from "../../../../src/domain/primitives/fitness";

describe("Fitness", () => {
	it("should create a valid fitness value", () => {
		expect(Fitness.of(0.95)).toBe(0.95);
	});
});
