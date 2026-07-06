/** Canonical type for TLS file paths used across all services. */
export interface TlsPaths {
	caPath: string;
	certPath: string;
	keyPath: string;
}

/** In-memory TLS PEM content (key, certificate, CA chain). */
export interface TlsPemBundle {
	key: string;
	cert: string;
	ca: string;
}

/** @deprecated Use TlsPemBundle instead (fields were optional for historical reasons). */
export interface TlsCredentials {
	ca?: string;
	cert?: string;
	key?: string;
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
		certPath: env.TLS_CERT_PATH,
		keyPath: env.TLS_KEY_PATH,
		caPath: env.TLS_CA_PATH,
	};
}
