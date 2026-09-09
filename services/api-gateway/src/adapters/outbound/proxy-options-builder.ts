import type https from "node:https";
import { HostPort } from "@trading-model/common/domain/service-identity";
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

export class TlsOptionsBuilder {
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
		};
	}
}

export const tlsOptionsBuilder = new TlsOptionsBuilder();
