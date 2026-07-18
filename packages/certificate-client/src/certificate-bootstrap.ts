import type https from "node:https";
import type { TlsBootstrapOptions } from "@trading-model/server-utils/server/bootstrap";
import type { SecureServerOptions } from "@trading-model/server-utils/server/create-secure-server";
import type { HttpServer } from "@trading-model/server-utils/server/server-factory";
import { setupAutoRenew } from "./certificate-auto-renew";
import type { BootstrapConfig } from "./certificate-bootstrap-config";
import { bootstrapConfigFromEnv } from "./certificate-bootstrap-config";
import {
	bootstrapCertificate,
	bootstrapFromEnv,
} from "./certificate-bootstrapper";
import { createServerApp } from "./certificate-server-creator";

export type { BootstrapConfig } from "./certificate-bootstrap-config";
export { bootstrapConfigFromEnv } from "./certificate-bootstrap-config";
export {
	bootstrapCertificate,
	bootstrapFromEnv,
} from "./certificate-bootstrapper";

export interface CreateHttpsServerOptions extends SecureServerOptions {
	env?: Record<string, string | undefined>;
	onServerReady?: (raw: https.Server) => void;
}

function _createTlsBootstrap(config: BootstrapConfig): TlsBootstrapOptions {
	return {
		ensure: () => bootstrapCertificate(config).then(() => {}),
		setupAutoRenew: (server: https.Server) => setupAutoRenew(server, config),
	};
}

export function createTlsBootstrap(
	env: Record<string, string | undefined>
): TlsBootstrapOptions | null {
	const config = bootstrapConfigFromEnv(env);
	if (!config) {
		return null;
	}
	return _createTlsBootstrap(config);
}

export async function createHttpsServer(
	options: CreateHttpsServerOptions
): Promise<HttpServer> {
	const env = options.env ?? {};
	const tls = (await bootstrapFromEnv(env)) ?? options.tls;
	const server = await createServerApp(options, tls);
	const config = bootstrapConfigFromEnv(env);
	if (config) {
		setupAutoRenew(server.raw, config);
	}
	return server;
}
