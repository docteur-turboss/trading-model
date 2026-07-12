import { describe, expect, it } from "@jest/globals";
import {
	ActivationFn,
	LayerType,
	Optimizer,
} from "@trading-model/validation/contracts/admin/training.dto";

describe("LayerType", () => {
	it("should have correct enum values", () => {
		expect(LayerType).toBeDefined();
	});
});

describe("ActivationFn", () => {
	it("should have correct enum values", () => {
		expect(ActivationFn).toBeDefined();
	});
});

describe("Optimizer", () => {
	it("should have correct enum values", () => {
		expect(Optimizer).toBeDefined();
	});
});
