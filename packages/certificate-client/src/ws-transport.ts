import { logger } from "@trading-model/common/config/logger";
import {
	DurationMs,
	type URLString,
} from "@trading-model/common/domain/primitives";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import { createWsConnectTimeout } from "@trading-model/common/utils/ws-reconnect";
import { BaseWsConnection } from "@trading-model/common/ws/base-ws-connection";
import WebSocket from "ws";
import { buildTlsConfig } from "./tls-config-builder";

export interface WsTransportConfig {
	url: URLString;
	tlsConfig?: TlsPaths;
}

export class WsTransport extends BaseWsConnection {
	private readonly _tlsConfig?: import("@trading-model/common/domain/tls-paths").TlsPaths;
	private readonly _url: URLString;
	onTimeout: () => void = () => {};

	constructor(config: WsTransportConfig) {
		super();
		this._url = config.url;
		this._tlsConfig = config.tlsConfig;
	}

	connect(): void {
		try {
			const ws = new WebSocket(this._url, buildTlsConfig(this._tlsConfig));
			ws.binaryType = "nodebuffer";
			this._ws = ws;
			const cancelTimeout = createWsConnectTimeout(() => {
				logger.warn("WSS connection timeout");
				ws.close();
				this.onTimeout?.();
			}, DurationMs.of(10_000));
			ws.on("open", () => {
				cancelTimeout();
				this.onOpen?.();
			});
			ws.on("message", (data: WebSocket.Data) => {
				this.onMessage?.(data);
			});
			ws.on("close", () => {
				cancelTimeout();
				this.onCloseHandler?.();
			});
			ws.on("error", (err: Error) => {
				cancelTimeout();
				logger.error("WSS transport error", { err: err.message });
				this.onError?.(err);
			});
		} catch (err) {
			logger.error("Failed to create WSS connection", { err });
			this.onTimeout?.();
		}
	}
}
