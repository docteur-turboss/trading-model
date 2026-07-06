import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import type WebSocket from "ws";

export class TlsConfigBuilder {
	constructor(private readonly _tlsConfig?: TlsPaths) {}

	build(): WebSocket.ClientOptions {
		const opts: WebSocket.ClientOptions = {};
		if (this._tlsConfig) {
			opts.ca = this._tlsConfig.caPath;
			opts.cert = this._tlsConfig.certPath;
			opts.key = this._tlsConfig.keyPath;
			opts.rejectUnauthorized = true;
		}
		opts.minVersion = "TLSv1.3";
		opts.ciphers =
			"TLS_AES_256_GCM_SHA384:TLS_AES_128_GCM_SHA256:TLS_CHACHA20_POLY1305_SHA256";
		return opts;
	}
}
