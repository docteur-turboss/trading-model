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
): TlsPaths;
export function loadTlsConfig(paths: TlsPaths): TlsPaths;
export function loadTlsConfig(
	keyPathOrPaths: string | TlsPaths,
	certPath?: string,
	caPath?: string
): TlsPaths {
	if (typeof keyPathOrPaths === "object") {
		return keyPathOrPaths;
	}
	return {
		keyPath: keyPathOrPaths,
		certPath: certPath!,
		caPath: caPath!,
	};
}
