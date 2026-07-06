import { describe, expect, test } from "@jest/globals";
import {
	sampleCauchy,
	sampleGaussian,
	sampleLevy,
	sampleNoise,
	sampleUniform,
} from "../../../src/core/genetic-algorithm/noise";
import { MutationDistribution } from "../../../src/core/genetic-algorithm/genome";

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

	test("sampleCauchy should return finite value", () => {
		const result = sampleCauchy(rng, 1);
		expect(Number.isFinite(result)).toBe(true);
	});

	test("sampleUniform should return value in range", () => {
		const result = sampleUniform(rng, 1);
		expect(result).toBeGreaterThanOrEqual(-1);
		expect(result).toBeLessThanOrEqual(1);
	});

	test("sampleUniform with sigma=0 should return 0", () => {
		const result = sampleUniform(rng, 0);
		expect(result).toBe(0);
	});

	test("sampleLevy should return finite value", () => {
		const result = sampleLevy(rng, 1);
		expect(Number.isFinite(result)).toBe(true);
	});

	describe("sampleNoise dispatcher", () => {
		test("should dispatch gaussian", () => {
			const result = sampleNoise(MutationDistribution.Gaussian, 1, rng);
			expect(Number.isFinite(result)).toBe(true);
		});

		test("should dispatch cauchy", () => {
			const result = sampleNoise(MutationDistribution.Cauchy, 1, rng);
			expect(Number.isFinite(result)).toBe(true);
		});

		test("should dispatch uniform", () => {
			const result = sampleNoise(MutationDistribution.Uniform, 1, rng);
			expect(result).toBeGreaterThanOrEqual(-1);
			expect(result).toBeLessThanOrEqual(1);
		});

		test("should dispatch levy", () => {
			const result = sampleNoise(MutationDistribution.Levy, 1, rng);
			expect(Number.isFinite(result)).toBe(true);
		});
	});
});
