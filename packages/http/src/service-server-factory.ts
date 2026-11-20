import type { TlsEnvVars } from "@trading-model/common/config/tls-paths";
import { configurationError } from "@trading-model/common/utils/errors";
import { Port, type ServiceId } from "@trading-model/primitives/primitives";
import type { Application } from "express";
import {
	type AuthorizationOptions,
	buildTlsFromEnv,
	createSecureServer,
} from "./create-secure-server";
import type { ReadinessCheck } from "./readiness";
import type { HttpsServer } from "./server-factory";

export interface ServiceServerOptions {
	env: TlsEnvVars & { PORT: number };
	/** Canonical SPIFFE service identity used as the ACL target for inbound authorization (ADR-0011). */
	serviceId?: ServiceId;
	routes: (app: Application) => void;
	trustProxy?: boolean;
	readiness?: ReadinessCheck[];
}

export function createServiceServer(
	options: ServiceServerOptions
): Promise<HttpsServer> {
	return createSecureServer({
		port: Port.of(options.env.PORT),
		tls: buildTlsFromEnv(options.env),
		trustProxy: options.trustProxy,
		authorize: _resolveAuthorization(options),
		routes: options.routes,
		readiness: options.readiness,
	});
}

function _resolveAuthorization(
	options: ServiceServerOptions
): AuthorizationOptions {
	if (!options.serviceId) {
		throw configurationError(
			"createServiceServer received no serviceId: the caller ACL needs a target service."
		);
	}
	return { targetService: options.serviceId };
}
