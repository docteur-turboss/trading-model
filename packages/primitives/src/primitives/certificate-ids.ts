import type { BrandedNumber, BrandedString } from "./branded-utils";
import { createNumberBrand, createStringBrand } from "./branded-utils";

export type SerialNumber = BrandedString<"SerialNumber">;
export const SerialNumber = createStringBrand("SerialNumber");
export function toSerialNumber(value: string): SerialNumber {
	return SerialNumber.of(value);
}
export function fromSerialNumber(value: SerialNumber): string {
	return value;
}

export type Fingerprint = BrandedString<"Fingerprint">;
export const Fingerprint = createStringBrand("Fingerprint");
export function toFingerprint(value: string): Fingerprint {
	return Fingerprint.of(value);
}
export function fromFingerprint(value: Fingerprint): string {
	return value;
}

const pemValidator = (type: string) => (value: string) => {
	if (!value.includes("-----BEGIN")) {
		throw new RangeError(
			`${type} must be a valid PEM, got ${JSON.stringify(value.slice(0, 60))}`
		);
	}
};

export type CertPem = BrandedString<"CertPem">;
export const CertPem = createStringBrand("CertPem", pemValidator("CertPem"));
export function toCertPem(value: string): CertPem {
	return CertPem.of(value);
}
export function fromCertPem(value: CertPem): string {
	return value;
}

export type CaPem = BrandedString<"CaPem">;
export const CaPem = createStringBrand("CaPem", pemValidator("CaPem"));
export function toCaPem(value: string): CaPem {
	return CaPem.of(value);
}
export function fromCaPem(value: CaPem): string {
	return value;
}

export type CsrPem = BrandedString<"CsrPem">;
export const CsrPem = createStringBrand("CsrPem", pemValidator("CsrPem"));
export function toCsrPem(value: string): CsrPem {
	return CsrPem.of(value);
}
export function fromCsrPem(value: CsrPem): string {
	return value;
}

export type KeyPem = BrandedString<"KeyPem">;
export const KeyPem = createStringBrand("KeyPem", pemValidator("KeyPem"));
export function toKeyPem(value: string): KeyPem {
	return KeyPem.of(value);
}
export function fromKeyPem(value: KeyPem): string {
	return value;
}

export type KeyVersion = BrandedNumber<"KeyVersion">;
export const KeyVersion = createNumberBrand("KeyVersion", (value) => {
	if (!Number.isInteger(value) || value < 0) {
		throw new RangeError(
			`KeyVersion must be a non-negative integer, got ${value}`
		);
	}
});
export function toKeyVersion(value: number): KeyVersion {
	return KeyVersion.of(value);
}
export function fromKeyVersion(value: KeyVersion): number {
	return value;
}
