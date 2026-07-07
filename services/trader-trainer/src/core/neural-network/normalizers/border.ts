import type { NormalizeParams, Normalizer } from "./normalizer-interface";

export class BorderNormalizer implements Normalizer {
	normalize(
		data: Float32Array,
		len: number,
		params?: NormalizeParams
	): Float32Array {
		let lo = params?.lo;
		let hi = params?.hi;

		if (lo === undefined || hi === undefined) {
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

			if (lo === undefined) {
				lo = min;
			}
			if (hi === undefined) {
				hi = max;
			}
		}

		for (let i = 0; i < len; i++) {
			const value = data[i];
			data[i] = value < lo ? lo : value > hi ? hi : value;
		}

		return data;
	}
}
