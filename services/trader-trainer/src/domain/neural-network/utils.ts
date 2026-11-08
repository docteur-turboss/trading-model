export function clipGradients(
	delta: Float32Array,
	maxNorm: number
): Float32Array {
	if (maxNorm <= 0) {
		return delta;
	}
	let sum = 0;
	for (const value of delta) {
		sum += value * value;
	}
	const norm = Math.sqrt(sum);
	if (norm > maxNorm) {
		const scale = maxNorm / norm;
		for (let i = 0; i < delta.length; i++) {
			delta[i] *= scale;
		}
	}
	return delta;
}
