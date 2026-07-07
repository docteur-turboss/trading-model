import type https from "node:https";
import type { HttpServer } from "./create-secure-server";

export interface TlsBootstrapOptions {
	ensure: () => Promise<void>;
	setupAutoRenew?: (server: https.Server) => void;
}

export interface BootstrapOptions {
	name: string;
	createServer: () => HttpServer | Promise<HttpServer>;
	onBeforeServer?: () => void | Promise<void>;
	onStart?: () => void;
	onStop?: () => void;
	tlsBootstrap?: TlsBootstrapOptions | null;
}
