export type SharpeRatio = number & { readonly brand: "SharpeRatio" };

export function toSharpeRatio(value: number): SharpeRatio {
	return SharpeRatio.of(value);
}

export function fromSharpeRatio(value: SharpeRatio): number {
	return value;
}

export const SharpeRatio = {
	of(value: number): SharpeRatio {
		if (!Number.isFinite(value)) {
			throw new RangeError(`SharpeRatio must be a finite number, got ${value}`);
		}
		return value as SharpeRatio;
	},
};
