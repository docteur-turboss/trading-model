export function isTimestampFresh(
	timestamp: number,
	toleranceMs = 300_000
): boolean {
	return (
		!Number.isNaN(timestamp) && Math.abs(Date.now() - timestamp) <= toleranceMs
	);
}
