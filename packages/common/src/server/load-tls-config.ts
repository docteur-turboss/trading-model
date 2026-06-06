/** TLS file paths required to configure an HTTPS server. */
export interface TlsConfig {
  key: string;
  cert: string;
  ca: string;
}

/** Reads TLS configuration from environment variables and returns structured paths. */
export function loadTlsConfig(env: {
  TLS_KEY_PATH: string;
  TLS_CERT_PATH: string;
  TLS_CA_PATH: string;
}): TlsConfig {
  return { key: env.TLS_KEY_PATH, cert: env.TLS_CERT_PATH, ca: env.TLS_CA_PATH };
}
