import type { SecureContextOptions } from "node:tls";
import { type CaPem, type CertPem, FilePath, type KeyPem } from "./primitives";

/** Canonical type for TLS file paths used across all services. */
export interface TlsPaths {
	caPath: FilePath;
	certPath: FilePath;
	keyPath: FilePath;
}

/** In-memory TLS PEM content (key, certificate, CA chain). */
export interface TlsPemBundle {
	keyPem: KeyPem;
	certPem: CertPem;
	caPem: CaPem;
}

/** Converts a TlsPemBundle to the object shape expected by tls.createServer / setSecureContext. */
export function toSecureContextOptions(
	bundle: TlsPemBundle
): SecureContextOptions {
	return {
		key: bundle.keyPem,
		cert: bundle.certPem,
		ca: bundle.caPem,
	};
}

/**
 * Build a TlsPaths object from an env dictionary that contains
 * TLS_CERT_PATH, TLS_KEY_PATH, and TLS_CA_PATH keys.
 */
export function buildTlsFromEnv(env: {
	TLS_CERT_PATH: string;
	TLS_KEY_PATH: string;
	TLS_CA_PATH: string;
}): TlsPaths {
	return {
		certPath: FilePath.of(env.TLS_CERT_PATH),
		keyPath: FilePath.of(env.TLS_KEY_PATH),
		caPath: FilePath.of(env.TLS_CA_PATH),
	};
}
