import { buildHttpsAgentOptions } from "@trading-model/common/config/http-tls-loader";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import type WebSocket from "ws";

export function buildTlsConfig(tlsConfig?: TlsPaths): WebSocket.ClientOptions {
	const agentOpts = buildHttpsAgentOptions(tlsConfig) ?? {};
	const opts: WebSocket.ClientOptions = {
		...(agentOpts as WebSocket.ClientOptions),
		rejectUnauthorized: true,
		minVersion: "TLSv1.3",
		ciphers:
			"TLS_AES_256_GCM_SHA384:TLS_AES_128_GCM_SHA256:TLS_CHACHA20_POLY1305_SHA256",
	};
	return opts;
}
