export type UnixTimestamp = number & { readonly brand: "UnixTimestamp" };

export const UnixTimestamp = {
	of(value: number): UnixTimestamp {
		if (!Number.isFinite(value) || value < 0) {
			throw new RangeError(
				`UnixTimestamp must be a non-negative finite number, got ${value}`
			);
		}
		return value as UnixTimestamp;
	},

	now(): UnixTimestamp {
		return Date.now() as UnixTimestamp;
	},

	toDate(value: UnixTimestamp): Date {
		return new Date(value);
	},

	isAfter(left: UnixTimestamp, right: UnixTimestamp): boolean {
		return left > right;
	},

	isBefore(left: UnixTimestamp, right: UnixTimestamp): boolean {
		return left < right;
	},

	add(value: UnixTimestamp, ms: number): UnixTimestamp {
		return (value + ms) as UnixTimestamp;
	},

	subtract(value: UnixTimestamp, ms: number): UnixTimestamp {
		return (value - ms) as UnixTimestamp;
	},

	elapsed(from: UnixTimestamp): number {
		return UnixTimestamp.now() - from;
	},
};
