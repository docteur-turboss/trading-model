export type MemoryAmount = number & { readonly brand: "MemoryAmount" };

export const MemoryAmount = {
	of(value: number): MemoryAmount {
		if (!Number.isFinite(value) || value < 0) {
			throw new RangeError(
				`MemoryAmount must be a non-negative finite number, got ${value}`
			);
		}
		return value as MemoryAmount;
	},

	zero(): MemoryAmount {
		return 0 as MemoryAmount;
	},

	add(left: MemoryAmount, right: MemoryAmount): MemoryAmount {
		return (left + right) as MemoryAmount;
	},

	sub(left: MemoryAmount, right: MemoryAmount): MemoryAmount {
		return (left - right) as MemoryAmount;
	},

	gt(left: MemoryAmount, right: MemoryAmount): boolean {
		return left > right;
	},

	lt(left: MemoryAmount, right: MemoryAmount): boolean {
		return left < right;
	},

	toNumber(value: MemoryAmount): number {
		return value;
	},
};
