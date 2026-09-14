export function computeDelay(attempt: number): number {
	return Math.round(
		Math.min(200 * 2 ** (attempt - 1), 5000) * (0.5 + Math.random() * 0.5)
	);
}
