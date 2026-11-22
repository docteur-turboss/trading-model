/** `Retry-After` as a delay in ms: delta-seconds or HTTP date; 0 when absent or unreadable. */
export function retryAfterMs(header: string | undefined, now: number): number {
	if (header === undefined) {
		return 0;
	}
	const delay = /^[0-9]+$/.test(header.trim())
		? Number(header) * 1000
		: Date.parse(header) - now;
	return Number.isFinite(delay) && delay > 0 ? delay : 0;
}
