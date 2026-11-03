/**
 * Opaque, platform-agnostic handle to the underlying HTTP server.
 * Cross-layer contract shared by adapters (which produce it) and application
 * orchestration (which consumes it). Adapters narrow it to their concrete
 * runtime type through the {@link HttpServer} generic parameter.
 */
export type RawHttpServer = object;

/** The running HTTPS server contract produced by the adapters. */
export interface HttpServer<TRaw = RawHttpServer> {
	close: () => Promise<void>;
	raw: TRaw;
}
