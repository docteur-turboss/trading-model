import type https from "node:https";
import {
	buildTlsFromEnv,
	type TlsEnvVars,
} from "@trading-model/common/config/tls-paths";
import { buildHttpsAgentOptions } from "@trading-model/http/http-tls-loader";
import { HostPort } from "@trading-model/primitives/service-identity";
import type { ProxyRequestOptions } from "../../domain/ports/gateway.port";
import type { Env } from "../../infrastructure/config/env";
import { safeHeaders } from "../../shared/proxy-header-sanitizer";

export function buildProxyOptions(
	{ target, req, path, serviceName }: ProxyRequestOptions,
	env: Env
): https.RequestOptions {
	const url = new URL(path, `https://${HostPort.toAddress(target)}`);
	return {
		hostname: target.host,
		port: target.port,
		path: url.pathname + url.search,
		method: req.method,
		headers: safeHeaders(req, env.AUTH_TOKEN_HEADER),
		rejectUnauthorized: true,
		..._resolveSvidTls(env, serviceName),
	};
}

/**
 * Loads the gateway's own SVID for the outbound leg so downstream services
 * can authenticate it via mTLS/ACL (ADR-0011). Cached, and its files are
 * stat-checked every 5 s, so spiffe-helper rotation lands within 5 s. SVIDs carry only a
 * `spiffe://` URI SAN, so hostname verification is disabled in favour of
 * the SPIFFE trust bundle.
 */
function _resolveSvidTls(
	settings: Env,
	serviceName: string
): https.AgentOptions {
	return (
		buildHttpsAgentOptions(
			buildTlsFromEnv(settings as TlsEnvVars),
			serviceName
		) ?? {}
	);
}
