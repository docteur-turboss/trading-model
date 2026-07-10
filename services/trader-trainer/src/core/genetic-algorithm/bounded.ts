import { NumericRange } from "@trading-model/common/domain/numeric-range";

export interface Bounded<TValue extends number = number> {
	readonly min: TValue;
	readonly max: TValue;
}

export function createBounded<TValue extends number>(
	min: TValue,
	max: TValue
): Bounded<TValue> {
	new NumericRange(min, max);
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

export function boundedToRange<TValue extends number>(bounds: Bounded<TValue>): NumericRange {
	return new NumericRange(bounds.min, bounds.max);
}
