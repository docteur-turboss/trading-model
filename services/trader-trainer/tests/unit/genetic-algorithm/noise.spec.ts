import { describe, expect, test } from "@jest/globals";
import { sampleGaussian } from "../../../src/domain/genetic-algorithm/noise";

describe("Noise Samplers", () => {
	const rng = () => 0.5;

	test("sampleGaussian should return finite value", () => {
		const result = sampleGaussian(rng, 1);
		expect(Number.isFinite(result)).toBe(true);
	});

	test("sampleGaussian with sigma=0 should return 0", () => {
		const result = sampleGaussian(rng, 0);
		expect(Object.is(result, 0) || Object.is(result, -0)).toBe(true);
	});
});
