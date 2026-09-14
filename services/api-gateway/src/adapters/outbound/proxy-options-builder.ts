import type https from "node:https";
import {
	buildTlsFromEnv,
	type TlsEnvVars,
} from "@trading-model/common/config/tls-paths";
import { HostPort } from "@trading-model/common/domain/service-identity";
import { buildHttpsAgentOptions } from "@trading-model/http/infrastructure/http-tls-loader";
import type { ResolvedEndpoint } from "@trading-model/validation/adapters/outbound/service-resolver.types";
import type { Request } from "express";
import { ENV } from "../../infrastructure/config/env";
import { safeHeaders } from "../../shared/proxy-header-sanitizer";

export interface ProxyRequestOptions {
	req: Request;
	target: ResolvedEndpoint;
	path: string;
	timeoutMs?: number;
}

class TlsOptionsBuilder {
	buildOptions(opts: ProxyRequestOptions): https.RequestOptions {
		const { target, req, path, timeoutMs = ENV.PROXY_TIMEOUT_MS } = opts;
		const url = new URL(path, `https://${HostPort.toAddress(target)}`);
		return {
			hostname: target.host,
			port: target.port,
			path: url.pathname + url.search,
			method: req.method,
			headers: safeHeaders(req),
			rejectUnauthorized: true,
			timeout: timeoutMs,
			...this._resolveSvidTls(),
		};
	}

	/**
	 * Loads the gateway's own SVID for the outbound leg so downstream services
	 * can authenticate it via mTLS/ACL (ADR-0011). Re-read on every request so
	 * spiffe-helper rotation is picked up immediately. SVIDs carry only a
	 * `spiffe://` URI SAN, so hostname verification is disabled in favour of
	 * the SPIFFE trust bundle.
	 */
	private _resolveSvidTls(): https.AgentOptions {
		const env = ENV as TlsEnvVars;
		if (!(env.TLS_KEY_PATH && env.TLS_CERT_PATH && env.TLS_CA_PATH)) {
			return {};
		}
		return buildHttpsAgentOptions(buildTlsFromEnv(env)) ?? {};
	}
}

export const tlsOptionsBuilder = new TlsOptionsBuilder();
