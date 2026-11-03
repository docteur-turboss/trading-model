type BrandedString<Tag extends string> = string & { readonly brand: Tag };
type BrandedNumber<Tag extends string> = number & { readonly brand: Tag };

interface StringBrand<Tag extends string> {
	of(value: string): BrandedString<Tag>;
}

interface NumberBrand<Tag extends string> {
	of(value: number): BrandedNumber<Tag>;
}

interface AmountBrand<Tag extends string> extends NumberBrand<Tag> {
	zero(): BrandedNumber<Tag>;
	add(left: BrandedNumber<Tag>, right: BrandedNumber<Tag>): BrandedNumber<Tag>;
	sub(left: BrandedNumber<Tag>, right: BrandedNumber<Tag>): BrandedNumber<Tag>;
	gt(left: BrandedNumber<Tag>, right: BrandedNumber<Tag>): boolean;
	lt(left: BrandedNumber<Tag>, right: BrandedNumber<Tag>): boolean;
	toNumber(value: BrandedNumber<Tag>): number;
}

interface NumberBrandOptions {
	finite?: boolean;
	integer?: boolean;
	min?: number;
	max?: number;
	message?: string | ((value: number) => string);
	validate?: (value: number) => void;
}

type NumberBrandConfig = NumberBrandOptions | ((value: number) => void);

function createStringBrand<Tag extends string>(
	tag: Tag,
	validate?: (value: string) => void,
	allowEmpty = false
): StringBrand<Tag> {
	return {
		of(value: string): BrandedString<Tag> {
			if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
				throw new RangeError(
					`${tag} must be a non-empty string, got ${JSON.stringify(value)}`
				);
			}
			validate?.(value);
			return value as BrandedString<Tag>;
		},
	};
}

function createNumberBrand<Tag extends string>(
	tag: Tag,
	config?: NumberBrandConfig
): NumberBrand<Tag> {
	if (typeof config === "function") {
		return {
			of(value: number): BrandedNumber<Tag> {
				config(value);
				return value as BrandedNumber<Tag>;
			},
		};
	}

	if (config === undefined) {
		return {
			of(value: number): BrandedNumber<Tag> {
				return value as BrandedNumber<Tag>;
			},
		};
	}

	const finite = config.finite !== false;
	const integer = config.integer === true;
	const { min, max, validate } = config;

	return {
		of(value: number): BrandedNumber<Tag> {
			const invalid =
				(finite && !Number.isFinite(value)) ||
				(integer && !Number.isInteger(value)) ||
				(min !== undefined && value < min) ||
				(max !== undefined && value > max);
			if (invalid) {
				throw new RangeError(buildNumberBrandMessage(tag, config, value));
			}
			validate?.(value);
			return value as BrandedNumber<Tag>;
		},
	};
}

function createAmountBrand<Tag extends string>(tag: Tag): AmountBrand<Tag> {
	return {
		...createNumberBrand<Tag>(tag, { finite: true, min: 0 }),
		zero(): BrandedNumber<Tag> {
			return 0 as BrandedNumber<Tag>;
		},
		add(
			left: BrandedNumber<Tag>,
			right: BrandedNumber<Tag>
		): BrandedNumber<Tag> {
			return (left + right) as BrandedNumber<Tag>;
		},
		sub(
			left: BrandedNumber<Tag>,
			right: BrandedNumber<Tag>
		): BrandedNumber<Tag> {
			return (left - right) as BrandedNumber<Tag>;
		},
		gt(left: BrandedNumber<Tag>, right: BrandedNumber<Tag>): boolean {
			return left > right;
		},
		lt(left: BrandedNumber<Tag>, right: BrandedNumber<Tag>): boolean {
			return left < right;
		},
		toNumber(value: BrandedNumber<Tag>): number {
			return value;
		},
	};
}

function buildNumberBrandMessage<Tag extends string>(
	tag: Tag,
	options: NumberBrandOptions,
	value: number
): string {
	if (options.message !== undefined) {
		return typeof options.message === "function"
			? options.message(value)
			: options.message;
	}

	const integer = options.integer === true;
	const finite = options.finite !== false;
	const min = options.min;
	const max = options.max;

	let descriptor: string;
	if (integer && min === 1 && max === undefined) {
		descriptor = "a positive integer";
	} else if (integer && min === 0 && max === undefined) {
		descriptor = "a non-negative integer";
	} else if (integer) {
		descriptor = "an integer";
	} else if (finite && min === 0 && max === undefined) {
		descriptor = "a non-negative finite number";
	} else if (finite) {
		descriptor = "a finite number";
	} else {
		descriptor = "a number";
	}

	let bounds = "";
	if (min !== undefined && max !== undefined) {
		bounds = integer ? ` between ${min} and ${max}` : ` in [${min}, ${max}]`;
	} else if (max !== undefined) {
		bounds = ` <= ${max}`;
	} else if (min !== undefined && min !== 0 && min !== 1) {
		bounds = ` >= ${min}`;
	}

	return `${tag} must be ${descriptor}${bounds}, got ${value}`;
}

export type {
	AmountBrand,
	BrandedNumber,
	BrandedString,
	NumberBrand,
	NumberBrandOptions,
	StringBrand,
};
export { createAmountBrand, createNumberBrand, createStringBrand };
