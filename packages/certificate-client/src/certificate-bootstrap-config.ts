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

export function bootstrapConfigFromEnv(
	env: Record<string, string | undefined>
): BootstrapConfig | null {
	const caUrl = env.CERT_CLIENT_CA_URL;
	if (!caUrl) {
		return null;
	}
	return {
		caUrl,
		serviceId: env.CERT_CLIENT_SERVICE_ID ?? env.APP_NAME ?? "unknown",
		commonName:
			env.CERT_CLIENT_COMMON_NAME ??
			env.CERT_CLIENT_SERVICE_ID ??
			env.APP_NAME ??
			"unknown",
		san: env.CERT_CLIENT_SANS?.split(",").map((entry) => entry.trim()) ?? [
			env.CERT_CLIENT_SERVICE_ID ?? env.APP_NAME ?? "unknown",
		],
		tlsPaths: {
			certPath: env.TLS_CERT_PATH ?? "/etc/tls/cert.pem",
			keyPath: env.TLS_KEY_PATH ?? "/etc/tls/key.pem",
			caPath: env.TLS_CA_PATH ?? "/etc/tls/ca.pem",
		},
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
