import type { TlsPaths } from "../domain/tls-paths";

export type { TlsPaths };

/** @deprecated Use TlsPaths directly. */
export type TlsConfig = TlsPaths;

/**
 * Reads TLS configuration from individual file paths and returns structured paths.
 * @deprecated Use TlsPaths directly instead of this translation function.
 */
export function loadTlsConfig(
	keyPath: string,
	certPath: string,
	caPath: string
): TlsPaths {
	return {
		keyPath,
		certPath,
		caPath,
	};
}
