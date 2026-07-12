/**
 * Supported key generation algorithms.
 */
export enum KeyAlgorithm {
	Rsa4096 = "rsa",
	EcP384 = "ec",
}

/**
 * Resolves Node.js algorithm options for a given key algorithm.
 */
export function getAlgorithmOptions(
	algorithm: KeyAlgorithm
): Record<string, unknown> {
	return algorithm === KeyAlgorithm.Rsa4096
		? { modulusLength: 4096 }
		: { namedCurve: "P-384" };
}

/**
 * Returns the encoding configuration for PEM-encoded SPKI/PKCS8 key output.
 */
export function getKeyEncoding(): {
	publicKeyEncoding: { type: "spki"; format: "pem" };
	privateKeyEncoding: { type: "pkcs8"; format: "pem" };
} {
	return {
		publicKeyEncoding: { type: "spki" as const, format: "pem" as const },
		privateKeyEncoding: { type: "pkcs8" as const, format: "pem" as const },
	};
}
