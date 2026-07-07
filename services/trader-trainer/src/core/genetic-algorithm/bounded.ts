export interface Bounded<T extends number = number> {
	readonly min: T;
	readonly max: T;
}

export function createBounded<T extends number>(min: T, max: T): Bounded<T> {
	if (min >= max) {
		throw new RangeError(`Bounded(min=${min}, max=${max}): min must be < max`);
	}
	return { min, max };
}

export function clampToBounded<T extends number>(value: number, bounds: Bounded<T>): T {
	return Math.max(bounds.min, Math.min(bounds.max, value)) as T;
}

export function isWithinBounds<T extends number>(value: number, bounds: Bounded<T>): boolean {
	return value >= bounds.min && value <= bounds.max;
}
