/** Returns true when the epoch-ms timestamp is within `toleranceMs` (default 5 min) of now, past or future, to reject replays. */
export function isTimestampFresh(
	timestamp: number,
	toleranceMs = 300_000
): boolean {
	return (
		!Number.isNaN(timestamp) && Math.abs(Date.now() - timestamp) <= toleranceMs
	);
}
