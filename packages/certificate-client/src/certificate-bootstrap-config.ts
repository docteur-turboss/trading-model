import type { TlsPaths } from "@trading-model/common/domain/tls-paths";

export interface BootstrapConfig {
	caUrl: string;
	serviceId: string;
	commonName: string;
	san: string[];
	tlsPaths: TlsPaths;
	bootstrapToken?: string;
	tls?: TlsPaths;
}

function _resolveServiceId(env: Record<string, string | undefined>): string {
	return env.CERT_CLIENT_SERVICE_ID ?? env.APP_NAME ?? "unknown";
}

function _resolveCommonName(env: Record<string, string | undefined>): string {
	return (
		env.CERT_CLIENT_COMMON_NAME ??
		env.CERT_CLIENT_SERVICE_ID ??
		env.APP_NAME ??
		"unknown"
	);
}

function _resolveSan(env: Record<string, string | undefined>): string[] {
	const raw = env.CERT_CLIENT_SANS;
	if (raw) {
		return raw.split(",").map((entry) => entry.trim());
	}
	return [env.CERT_CLIENT_SERVICE_ID ?? env.APP_NAME ?? "unknown"];
}

function _resolveTlsPaths(env: Record<string, string | undefined>): BootstrapConfig["tlsPaths"] {
	return {
		certPath: env.TLS_CERT_PATH ?? "/etc/tls/cert.pem",
		keyPath: env.TLS_KEY_PATH ?? "/etc/tls/key.pem",
		caPath: env.TLS_CA_PATH ?? "/etc/tls/ca.pem",
	};
}

export function bootstrapConfigFromEnv(
	env: Record<string, string | undefined>
): BootstrapConfig | null {
	const caUrl = env.CERT_CLIENT_CA_URL;
	if (!caUrl) {
		return null;
	}
	return {
		caUrl,
		serviceId: _resolveServiceId(env),
		commonName: _resolveCommonName(env),
		san: _resolveSan(env),
		tlsPaths: _resolveTlsPaths(env),
		bootstrapToken: env.CERT_CLIENT_BOOTSTRAP_TOKEN,
		tls: _buildClientTls(env),
	};
}

function _buildClientTls(
	env: Record<string, string | undefined>
): BootstrapConfig["tls"] {
	if (!env.CA_CLIENT_TLS_KEY) {
		return;
	}
	return {
		keyPath: env.CA_CLIENT_TLS_KEY,
		certPath: env.CA_CLIENT_TLS_CERT ?? "",
		caPath: env.CA_CLIENT_TLS_CA ?? "",
	};
}
