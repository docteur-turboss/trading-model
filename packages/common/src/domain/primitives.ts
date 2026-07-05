/**
 * Value objects for financial primitives — branded number types.
 *
 * Each type is a compile-time-only branding over `number`:
 * - No runtime overhead (they ARE numbers)
 * - Full arithmetic compatibility
 * - Construction functions validate and brand
 *
 * Follows the existing `TradingSymbol` pattern from trader-trainer.
 */

// ----------------------------------------------------------------
// Price
// ----------------------------------------------------------------

export type Price = number & { readonly __brand: "Price" };

export const Price = {
	of(value: number): Price {
		if (!Number.isFinite(value) || value < 0) {
			throw new RangeError(
				`Price must be a non-negative finite number, got ${value}`
			);
		}
		return value as Price;
	},

	zero(): Price {
		return 0 as Price;
	},
};

// ----------------------------------------------------------------
// Volume
// ----------------------------------------------------------------

export type Volume = number & { readonly __brand: "Volume" };

export const Volume = {
	of(value: number): Volume {
		if (!Number.isFinite(value) || value < 0) {
			throw new RangeError(
				`Volume must be a non-negative finite number, got ${value}`
			);
		}
		return value as Volume;
	},

	zero(): Volume {
		return 0 as Volume;
	},
};

// ----------------------------------------------------------------
// Percentage (decimal ratio)
// ----------------------------------------------------------------

export type Percentage = number & { readonly __brand: "Percentage" };

export const Percentage = {
	/** Create from a decimal ratio (e.g. 0.05 for 5%). */
	of(value: number): Percentage {
		if (!Number.isFinite(value)) {
			throw new RangeError(
				`Percentage must be a finite number, got ${value}`
			);
		}
		return value as Percentage;
	},

	/** Create from a percentage point value (e.g. 5 for 5%). */
	fromPercent(percent: number): Percentage {
		return Percentage.of(percent / 100);
	},

	zero(): Percentage {
		return 0 as Percentage;
	},
};

// ----------------------------------------------------------------
// UnixTimestamp (epoch milliseconds)
// ----------------------------------------------------------------

export type UnixTimestamp = number & { readonly __brand: "UnixTimestamp" };

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
};
