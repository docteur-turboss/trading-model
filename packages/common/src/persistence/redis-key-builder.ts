export function buildRedisKey(prefix: string, ...segments: string[]): string {
	return `${prefix}${segments.join(":")}`;
}

export function extendRedisKey(prefix: string, suffix: string): string {
	return `${prefix}${suffix}`;
}

export class RedisKeyBuilder {
	constructor(private readonly _prefix: string) {}

	key(...segments: string[]): string {
		return buildRedisKey(this._prefix, ...segments);
	}

	withSuffix(suffix: string): RedisKeyBuilder {
		return new RedisKeyBuilder(extendRedisKey(this._prefix, suffix));
	}
}
