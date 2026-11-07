export function buildRedisKey(prefix: string, ...segments: string[]): string {
	return `${prefix}${segments.join(":")}`;
}
