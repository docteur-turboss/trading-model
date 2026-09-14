import type { TlsEnvVars } from "@trading-model/common/config/tls-paths";
import { Port, type ServiceId } from "@trading-model/common/domain/primitives";
import { configurationError } from "@trading-model/common/utils/errors";
import type { Application } from "express";
import {
	type AuthorizationOptions,
	buildTlsFromEnv,
	createSecureServer,
	type RateLimitConfig,
} from "./create-secure-server";
import type { HttpsServer } from "./server-factory";

export interface ServiceServerOptions {
	env: TlsEnvVars & { PORT: number; ENFORCE_MTLS_STRICT?: boolean };
	/**
	 * Canonical SPIFFE service identity used as the ACL target for inbound
	 * authorization (ADR-0011). Required when `ENFORCE_MTLS_STRICT` is enabled.
	 */
	serviceId?: ServiceId;
	routes: (app: Application) => void;
	trustProxy?: boolean;
	rateLimit?: RateLimitConfig;
}

export function createServiceServer(
	options: ServiceServerOptions
): Promise<HttpsServer> {
	return createSecureServer({
		port: Port.of(options.env.PORT),
		tls: buildTlsFromEnv(options.env),
		trustProxy: options.trustProxy,
		rateLimit: options.rateLimit,
		authorize: _resolveAuthorization(options),
		routes: options.routes,
	});
}

function _resolveAuthorization(
	options: ServiceServerOptions
): AuthorizationOptions | undefined {
	if (!options.env.ENFORCE_MTLS_STRICT) {
		return;
	}
	if (!options.serviceId) {
		throw configurationError(
			"ENFORCE_MTLS_STRICT is enabled but createServiceServer received no serviceId"
		);
	}
	return { enabled: true, targetService: options.serviceId };
}
