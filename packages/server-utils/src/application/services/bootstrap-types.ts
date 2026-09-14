import type { HttpServer, RawHttpServer } from "../../shared/server-types";

export interface TlsBootstrapOptions {
	ensure: () => Promise<void>;
	setupAutoRenew?: (server: RawHttpServer) => void;
}

export interface BootstrapOptions {
	name: string;
	createServer: () => HttpServer | Promise<HttpServer>;
	onBeforeServer?: () => void | Promise<void>;
	onStart?: () => void;
	onStop?: () => void;
	tlsBootstrap?: TlsBootstrapOptions | null;
}
