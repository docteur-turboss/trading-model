export type CertificateId = string & { readonly brand: "CertificateId" };

export function toCertificateId(value: string): CertificateId {
	return CertificateId.of(value);
}

export function fromCertificateId(value: CertificateId): string {
	return value;
}

export const CertificateId = {
	of(value: string): CertificateId {
		if (typeof value !== "string" || value.length === 0) {
			throw new RangeError(
				`CertificateId must be a non-empty string, got ${JSON.stringify(value)}`
			);
		}
		return value as CertificateId;
	},
};

export type CommonName = string & { readonly brand: "CommonName" };

export function toCommonName(value: string): CommonName {
	return CommonName.of(value);
}

export function fromCommonName(value: CommonName): string {
	return value;
}

export const CommonName = {
	of(value: string): CommonName {
		if (typeof value !== "string" || value.length === 0) {
			throw new RangeError(
				`CommonName must be a non-empty string, got ${JSON.stringify(value)}`
			);
		}
		return value as CommonName;
	},
};
