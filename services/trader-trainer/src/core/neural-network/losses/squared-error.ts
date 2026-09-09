export function sumSquaredErrors(
	output: Float32Array,
	target: Float32Array
): number {
	let sum = 0;
	for (let i = 0; i < output.length; i++) {
		const err = target[i] - output[i];
		sum += err * err;
	}
	return sum;
}
