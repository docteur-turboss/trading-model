import type { SecureContextOptions } from "node:tls";
import { type CaPem, type CertPem, FilePath, type KeyPem } from "./primitives";

/** Canonical type for TLS file paths used across all services. */
export interface TlsPaths {
	caPath: FilePath;
	certPath: FilePath;
	keyPath: FilePath;
}

/** Environment variable names for TLS configuration.
 *  Services that read TLS_KEY_PATH, TLS_CERT_PATH, TLS_CA_PATH from env
 *  should use this interface instead of redeclaring them individually. */
export interface TlsEnvVars {
	TLS_KEY_PATH: string;
	TLS_CERT_PATH: string;
	TLS_CA_PATH: string;
}

/** In-memory TLS PEM content (key, certificate, CA chain). */
export interface TlsPemBundle {
	keyPem: KeyPem;
	certPem: CertPem;
	caPem: CaPem;
}

/**
 * Unified TLS configuration that accepts either file paths or in-memory PEMs.
 * At least one representation (paths or pems) must be provided.
 */
export interface TlsConfig {
	paths?: TlsPaths;
	pems?: TlsPemBundle;
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

/** Resolve SecureContextOptions from either a TlsConfig or a TlsPemBundle directly. */
export function resolveSecureContextOptions(
	config: TlsConfig | TlsPemBundle
): SecureContextOptions {
	if ("keyPem" in config) {
		return toSecureContextOptions(config);
	}
	if (config.pems) {
		return toSecureContextOptions(config.pems);
	}
	throw new Error(
		"Cannot resolve TLS context: no PEM data available in config"
	);
}

/**
 * Build a TlsPaths object from an env dictionary that contains
 * TLS_CERT_PATH, TLS_KEY_PATH, and TLS_CA_PATH keys.
 */
export function buildTlsFromEnv(env: TlsEnvVars): TlsPaths {
	return {
		certPath: FilePath.of(env.TLS_CERT_PATH),
		keyPath: FilePath.of(env.TLS_KEY_PATH),
		caPath: FilePath.of(env.TLS_CA_PATH),
	};
}

/** Build a TlsConfig from a TlsPaths (no PEMs loaded yet). */
export function toTlsConfig(paths: TlsPaths): TlsConfig {
	return { paths };
}

/** Build a TlsConfig from a TlsPemBundle (pre-loaded certificates). */
export function fromPemBundle(bundle: TlsPemBundle): TlsConfig {
	return { pems: bundle };
}
