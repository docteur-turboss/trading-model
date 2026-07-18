import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import type {
	HttpServer,
	HttpsServerOptions,
} from "@trading-model/server-utils/server/server-factory";
import type { CreateHttpsServerOptions } from "./certificate-bootstrap";

interface ServerDeps {
	configureApp: (opts: {
		rateLimit?: import("@trading-model/server-utils/server/configure-app").RateLimitConfig;
		trustProxy?: boolean;
	}) => import("express").Application;
	mtlsAuthMiddleware: import("express").RequestHandler;
	responseProtocol: import("express").RequestHandler;
	createAndStartHttpsServer: (
		app: import("express").Application,
		opts: HttpsServerOptions
	) => Promise<HttpServer>;
}

function _extractServerDeps(
	modules: [
		typeof import("@trading-model/server-utils/server/configure-app"),
		typeof import("@trading-model/common/middleware/mtls-auth"),
		typeof import("@trading-model/common/middleware/response-protocol"),
		typeof import("@trading-model/server-utils/server/server-factory"),
	]
): ServerDeps {
	return {
		configureApp: modules[0].configureApp,
		mtlsAuthMiddleware: modules[1].MTLSAuthMiddleware,
		responseProtocol: modules[2]
			.ResponseProtocol as unknown as import("express").RequestHandler,
		createAndStartHttpsServer: modules[3].createAndStartHttpsServer,
	};
}

async function loadServerDependencies(): Promise<ServerDeps> {
	const modules = await Promise.all([
		import("@trading-model/server-utils/server/configure-app"),
		import("@trading-model/common/middleware/mtls-auth"),
		import("@trading-model/common/middleware/response-protocol"),
		import("@trading-model/server-utils/server/server-factory"),
	]);
	return _extractServerDeps(modules);
}

function _configureAppWithMiddleware(
	configureApp: ServerDeps["configureApp"],
	mtlsAuthMiddleware: ServerDeps["mtlsAuthMiddleware"],
	responseProtocol: ServerDeps["responseProtocol"],
	options: CreateHttpsServerOptions
): import("express").Application {
	const app = configureApp({
		rateLimit: options.rateLimit,
		trustProxy: options.trustProxy,
	});
	app.use(mtlsAuthMiddleware);
	options.routes(app);
	app.use(responseProtocol);
	return app;
}

export async function createServerApp(
	options: CreateHttpsServerOptions,
	tls: TlsPaths
): Promise<HttpServer> {
	const deps = await loadServerDependencies();
	const app = _configureAppWithMiddleware(
		deps.configureApp,
		deps.mtlsAuthMiddleware,
		deps.responseProtocol,
		options
	);
	const server = await deps.createAndStartHttpsServer(app, {
		port: options.port,
		tls,
		watchTls: options.watchTls ?? true,
	});
	options.onServerReady?.(server.raw);
	return server;
}
