export function validateLengths(output: Float32Array, target: Float32Array): void {
	if (output.length !== target.length) {
		throw new RangeError(
			`Loss function input/output length mismatch: output.length=${output.length}, target.length=${target.length}`
		);
	}
}
