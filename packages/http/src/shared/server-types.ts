/** The running HTTPS server contract produced by the adapters. */
export interface HttpServer {
	close: () => Promise<void>;
}
