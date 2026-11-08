import { describe, expect, test } from "@jest/globals";
import {
	mseGradient,
	mseLoss,
} from "../../../src/domain/neural-network/output-delta-computer";

describe("mean squared error", () => {
	const output = new Float32Array([0.2, 0.5, 0.8]);
	const target = new Float32Array([1, 0, 1]);

	test("loss is the mean of the squared errors", () => {
		expect(mseLoss(output, target)).toBeCloseTo((0.64 + 0.25 + 0.04) / 3, 5);
	});

	test("gradient is 2*(output-target)/n", () => {
		const grad = mseGradient(output, target);
		expect(grad[0]).toBeCloseTo((2 * (0.2 - 1)) / 3, 5);
		expect(grad[1]).toBeCloseTo((2 * (0.5 - 0)) / 3, 5);
	});

	test.each([
		["longer", new Float32Array([1])],
		["shorter", new Float32Array([1, 0, 1, 0])],
	])(
		"loss and gradient throw when the output is %s than the target",
		(_label, badTarget) => {
			expect(() => mseLoss(output, badTarget)).toThrow(RangeError);
			expect(() => mseGradient(output, badTarget)).toThrow(RangeError);
		}
	);
});
