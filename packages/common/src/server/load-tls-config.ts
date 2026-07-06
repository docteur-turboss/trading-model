import type { TlsPaths } from "../domain/tls-paths";

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
