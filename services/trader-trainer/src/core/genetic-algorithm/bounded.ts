export interface Bounded<TValue extends number = number> {
	readonly min: TValue;
	readonly max: TValue;
}

export function createBounded<TValue extends number>(
	min: TValue,
	max: TValue
): Bounded<TValue> {
	if (min >= max) {
		throw new RangeError(`Bounded(min=${min}, max=${max}): min must be < max`);
	}
	return { min, max };
}

export function clampToBounded<TValue extends number>(
	value: number,
	bounds: Bounded<TValue>
): TValue {
	return Math.max(bounds.min, Math.min(bounds.max, value)) as TValue;
}

export function isWithinBounds<TValue extends number>(
	value: number,
	bounds: Bounded<TValue>
): boolean {
	return value >= bounds.min && value <= bounds.max;
}
