import { Port } from "@trading-model/common/domain/primitives";
import type { TlsEnvVars } from "@trading-model/common/domain/tls-paths";
import type { Application } from "express";
import {
	buildTlsFromEnv,
	createSecureServer,
	type RateLimitConfig,
} from "./create-secure-server";
import type { HttpServer } from "./server-factory";

export interface ServiceServerOptions {
	env: TlsEnvVars & { PORT: number };
	routes: (app: Application) => void;
	trustProxy?: boolean;
	rateLimit?: RateLimitConfig;
}

export function createServiceServer(
	options: ServiceServerOptions
): Promise<HttpServer> {
	return createSecureServer({
		port: Port.of(options.env.PORT),
		tls: buildTlsFromEnv(options.env),
		trustProxy: options.trustProxy,
		rateLimit: options.rateLimit,
		routes: options.routes,
	});
}
