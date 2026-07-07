import { NumericRange } from "@trading-model/common/domain/numeric-range";

export function _findMaxAbs(data: Float32Array): number {
	let maxAbs = 0;
	for (const value of data) {
		const abs = Math.abs(value);
		if (abs > maxAbs) {
			maxAbs = abs;
		}
	}
	return maxAbs;
}

export function _findMinMax(data: Float32Array): NumericRange {
	let min = data[0];
	let max = data[0];
	for (const value of data) {
		if (value < min) {
			min = value;
		}
		if (value > max) {
			max = value;
		}
	}
	return new NumericRange(min, max);
}

export function _computeMean(data: Float32Array, len: number): number {
	let sum = 0;
	for (const value of data) {
		sum += value;
	}
	return sum / len;
}

export function _computeInvStd(
	data: Float32Array,
	mean: number,
	len: number
): number {
	let variance = 0;
	for (const value of data) {
		variance += (value - mean) ** 2;
	}
	return 1 / (Math.sqrt(variance / len) || 1);
}
