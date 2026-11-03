import {
	buildTlsFromEnv,
	type TlsEnvVars,
} from "@trading-model/common/config/tls-paths";
import { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import { ENV } from "../infrastructure/config/env";

/**
 * mTLS client (SVID + trust bundle) for discovery: readiness probe and service
 * resolution. A client without them can never complete the handshake.
 */
export function createDiscoveryClient(env: TlsEnvVars): HttpClient {
	return HttpClient.createWithTls(buildTlsFromEnv(env));
}

export const discoveryClient = createDiscoveryClient(ENV);
