import { loadTlsPemBundle } from "@trading-model/common/config/http-tls-loader";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import type WebSocket from "ws";

export class TlsConfigBuilder {
	constructor(private readonly _tlsConfig?: TlsPaths) {}

	build(): WebSocket.ClientOptions {
		const opts: WebSocket.ClientOptions = {};
		if (this._tlsConfig) {
			const bundle = loadTlsPemBundle({
				caPem: this._tlsConfig.caPath,
				certPem: this._tlsConfig.certPath,
				keyPem: this._tlsConfig.keyPath,
			});
			if (bundle.caPem) {
				opts.ca = bundle.caPem;
			}
			if (bundle.certPem) {
				opts.cert = bundle.certPem;
			}
			if (bundle.keyPem) {
				opts.key = bundle.keyPem;
			}
			opts.rejectUnauthorized = true;
		}
		opts.minVersion = "TLSv1.3";
		opts.ciphers =
			"TLS_AES_256_GCM_SHA384:TLS_AES_128_GCM_SHA256:TLS_CHACHA20_POLY1305_SHA256";
		return opts;
	}
}
