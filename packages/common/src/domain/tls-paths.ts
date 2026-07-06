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
