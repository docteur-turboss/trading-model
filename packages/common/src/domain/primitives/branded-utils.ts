type BrandedString<Tag extends string> = string & { readonly brand: Tag };
type BrandedNumber<Tag extends string> = number & { readonly brand: Tag };

interface StringBrand<Tag extends string> {
	of(value: string): BrandedString<Tag>;
}

interface NumberBrand<Tag extends string> {
	of(value: number): BrandedNumber<Tag>;
}

function createStringBrand<Tag extends string>(
	tag: Tag,
	validate?: (value: string) => void
): StringBrand<Tag> {
	return {
		of(value: string): BrandedString<Tag> {
			if (typeof value !== "string" || value.length === 0) {
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
	_tag: Tag,
	validate?: (value: number) => void
): NumberBrand<Tag> {
	return {
		of(value: number): BrandedNumber<Tag> {
			validate?.(value);
			return value as BrandedNumber<Tag>;
		},
	};
}

export type { BrandedNumber, BrandedString, NumberBrand, StringBrand };
export { createNumberBrand, createStringBrand };
