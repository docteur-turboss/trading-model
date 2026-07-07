import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import { loadTlsPemBundle } from "@trading-model/common/config/http-tls-loader";
import type WebSocket from "ws";

export class TlsConfigBuilder {
	constructor(private readonly _tlsConfig?: TlsPaths) {}

	build(): WebSocket.ClientOptions {
		const opts: WebSocket.ClientOptions = {};
		if (this._tlsConfig) {
			const bundle = loadTlsPemBundle({
				ca: this._tlsConfig.caPath,
				cert: this._tlsConfig.certPath,
				key: this._tlsConfig.keyPath,
			});
			if (bundle.ca) opts.ca = bundle.ca;
			if (bundle.cert) opts.cert = bundle.cert;
			if (bundle.key) opts.key = bundle.key;
			opts.rejectUnauthorized = true;
		}
		opts.minVersion = "TLSv1.3";
		opts.ciphers =
			"TLS_AES_256_GCM_SHA384:TLS_AES_128_GCM_SHA256:TLS_CHACHA20_POLY1305_SHA256";
		return opts;
	}
}
