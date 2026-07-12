export class RedisKeyBuilder {
	constructor(private readonly _prefix: string) {}

	key(...segments: string[]): string {
		return `${this._prefix}${segments.join(":")}`;
	}

	withSuffix(suffix: string): RedisKeyBuilder {
		return new RedisKeyBuilder(`${this._prefix}${suffix}`);
	}
}
