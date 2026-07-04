/** TLS file paths required to configure an HTTPS server. */
export interface TlsConfig {
	key: string;
	cert: string;
	ca: string;
}

/** Reads TLS configuration from individual file paths and returns structured paths. */
export function loadTlsConfig(
	keyPath: string,
	certPath: string,
	caPath: string
): TlsConfig {
	return {
		key: keyPath,
		cert: certPath,
		ca: caPath,
	};
}
