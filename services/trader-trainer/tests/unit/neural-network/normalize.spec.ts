import { describe, expect, test } from "@jest/globals";
import { NumericRange } from "@trading-model/common/domain/numeric-range";
import type { DataSlice } from "../../../src/core/neural-network/normalize";
import { NORMALIZERS } from "../../../src/core/neural-network/normalize";
import { NormalisationType } from "../../../src/core/neural-network/type";

function makeSlice(values: number[]): DataSlice {
	const data = new Float32Array(values);
	return { data, len: values.length };
}

describe("Normalizers", () => {
	describe("none", () => {
		test("should return data unchanged", () => {
			const slice = makeSlice([1, 2, 3]);
			const result = NORMALIZERS.none.normalize(slice);
			expect(result).toBe(slice.data);
		});
	});

	describe(NormalisationType.DecimalScaling, () => {
		test("should handle non-increasing values (else branch)", () => {
			const slice = makeSlice([300, 200, 100]);
			NORMALIZERS[NormalisationType.DecimalScaling].normalize(slice);
			expect(slice.data[0]).toBeCloseTo(0.3, 5);
			expect(slice.data[1]).toBeCloseTo(0.2, 5);
			expect(slice.data[2]).toBeCloseTo(0.1, 5);
		});
	});

	describe(NormalisationType.MinMax, () => {
		test("should normalize to [0, 1]", () => {
			const slice = makeSlice([10, 20, 30]);
			const result = NORMALIZERS[NormalisationType.MinMax].normalize(slice);
			expect(result[0]).toBe(0);
			expect(result[2]).toBe(1);
			expect(result[1]).toBe(0.5);
		});

		test("should handle non-ascending data (else branches)", () => {
			const slice = makeSlice([30, 10, 20]);
			NORMALIZERS[NormalisationType.MinMax].normalize(slice);
			expect(slice.data[0]).toBe(1);
			expect(slice.data[1]).toBe(0);
		});

		test("should handle constant values", () => {
			const slice = makeSlice([5, 5, 5]);
			const result = NORMALIZERS[NormalisationType.MinMax].normalize(slice);
			for (const x of result) {
				expect(Number.isNaN(x)).toBe(true);
			}
		});

		test("should handle NaN values (division guard)", () => {
			const slice = makeSlice([Number.NaN, Number.NaN, Number.NaN]);
			const result = NORMALIZERS[NormalisationType.MinMax].normalize(slice);
			for (const x of result) {
				expect(Number.isNaN(x)).toBe(true);
			}
		});
	});

	describe(NormalisationType.ZScore, () => {
		test("should normalize to zero mean", () => {
			const slice = makeSlice([1, 2, 3]);
			const result = NORMALIZERS[NormalisationType.ZScore].normalize(slice);
			let sum = 0;
			for (const x of result) {
				sum += x;
			}
			expect(sum).toBeCloseTo(0, 5);
		});

		test("should handle constant values", () => {
			const slice = makeSlice([5, 5, 5]);
			const result = NORMALIZERS[NormalisationType.ZScore].normalize(slice);
			for (const x of result) {
				expect(x).toBe(0);
			}
		});
	});

	describe(NormalisationType.DecimalScaling, () => {
		test("should normalize by power of 10", () => {
			const slice = makeSlice([100, 200, 300]);
			const result =
				NORMALIZERS[NormalisationType.DecimalScaling].normalize(slice);
			expect(result[0]).toBeCloseTo(0.1, 5);
			expect(result[1]).toBeCloseTo(0.2, 5);
			expect(result[2]).toBeCloseTo(0.3, 5);
		});
	});

	describe(NormalisationType.LogarithmicNormalization, () => {
		test("should log normalize positive values", () => {
			const slice = makeSlice([1, 10]);
			const result =
				NORMALIZERS[NormalisationType.LogarithmicNormalization].normalize(
					slice
				);
			expect(result[0]).toBeCloseTo(Math.log(2), 5);
			expect(result[1]).toBeCloseTo(Math.log(11), 5);
		});

		test("should handle negative values", () => {
			const slice = makeSlice([-1]);
			const result =
				NORMALIZERS[NormalisationType.LogarithmicNormalization].normalize(
					slice
				);
			expect(result[0]).toBeCloseTo(-Math.log(2), 5);
		});
	});

	describe(NormalisationType.RobustScaling, () => {
		test("should scale by IQR", () => {
			const slice = makeSlice([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
			const result =
				NORMALIZERS[NormalisationType.RobustScaling].normalize(slice);
			expect(result[4]).toBeCloseTo((5 - 5.5) / (8 - 3), 3);
		});

		test("should handle constant values", () => {
			const slice = makeSlice([5, 5, 5]);
			const result =
				NORMALIZERS[NormalisationType.RobustScaling].normalize(slice);
			for (const x of result) {
				expect(x).toBe(0);
			}
		});
	});

	describe("border", () => {
		test("should clamp values with explicit params", () => {
			const slice = makeSlice([-10, 5, 20]);
			const result = NORMALIZERS.border.normalize(
				slice,
				new NumericRange(0, 10)
			);
			expect(result[0]).toBe(0);
			expect(result[1]).toBe(5);
			expect(result[2]).toBe(10);
		});

		test("should use data min/max when params missing", () => {
			const slice = makeSlice([-5, 10, 20]);
			const result = NORMALIZERS.border.normalize(slice);
			expect(result[0]).toBe(-5);
			expect(result[0]).toBe(-5);
			expect(result[1]).toBe(10);
			expect(result[2]).toBe(20);
		});

		test("should handle partial params", () => {
			const slice = makeSlice([-10, 5, 20]);
			const result = NORMALIZERS.border.normalize(slice, {
				min: -5,
				max: undefined as any,
			} as any);
			expect(result[0]).toBe(-5);
			expect(result[1]).toBe(5);
		});

		test("should use data bounds when both params missing with descending data", () => {
			const slice = makeSlice([20, 10, -5]);
			const result = NORMALIZERS.border.normalize(slice);
			expect(result[0]).toBe(20);
			expect(result[1]).toBe(10);
			expect(result[2]).toBe(-5);
		});

		test("should use data min when only max param provided", () => {
			const slice = makeSlice([-5, 10, 20]);
			const result = NORMALIZERS.border.normalize(slice, { max: 10 } as any);
			expect(result[0]).toBe(-5);
			expect(result[1]).toBe(10);
			expect(result[2]).toBe(10);
		});
	});
});
