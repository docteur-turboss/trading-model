import type { TlsPaths } from "../domain/tls-paths";

export type { TlsPaths };

/**
 * Identity function that accepts or returns a TlsPaths object.
 */
export function loadTlsConfig(paths: TlsPaths): TlsPaths {
	return paths;
}
