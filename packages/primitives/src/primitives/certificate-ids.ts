import type { BrandedString } from "./branded-utils";
import { createStringBrand } from "./branded-utils";

const pemValidator = (type: string) => (value: string) => {
	if (!value.includes("-----BEGIN")) {
		throw new RangeError(
			`${type} must be a valid PEM, got ${JSON.stringify(value.slice(0, 60))}`
		);
	}
};

export type CertPem = BrandedString<"CertPem">;
export const CertPem = createStringBrand("CertPem", pemValidator("CertPem"));

export type CaPem = BrandedString<"CaPem">;
export const CaPem = createStringBrand("CaPem", pemValidator("CaPem"));

export type KeyPem = BrandedString<"KeyPem">;
export const KeyPem = createStringBrand("KeyPem", pemValidator("KeyPem"));
