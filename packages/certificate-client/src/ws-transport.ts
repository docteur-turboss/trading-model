import { logger } from "@trading-model/common/config/logger";
import {
	DurationMs,
	type URLString,
} from "@trading-model/common/domain/primitives";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import { createWsConnectTimeout } from "@trading-model/common/utils/ws-reconnect";
import type { IWsConnection } from "@trading-model/common/ws/i-ws-connection";
import WebSocket from "ws";
import { TlsConfigBuilder } from "./tls-config-builder";

export class WsTransport implements IWsConnection {
	private _ws: WebSocket | undefined;
	private readonly _tlsBuilder: TlsConfigBuilder;
	onCloseHandler: () => void = () => {};
	onOpen: () => void = () => {};
	onMessage: (data: unknown) => void = () => {};
	onError: (err: Error) => void = () => {};
	onTimeout: () => void = () => {};

	constructor(
		private readonly _url: URLString,
		tlsConfig?: TlsPaths
	) {
		this._tlsBuilder = new TlsConfigBuilder(tlsConfig);
	}

	connect(): void {
		try {
			const ws = new WebSocket(this._url, this._tlsBuilder.build());
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

	disconnect(closeCode?: number, reason?: string): void {
		try {
			this._ws?.removeAllListeners();
			this._ws?.close(closeCode, reason);
		} catch {
			logger.debug("WebSocket close error during disconnect");
		}
	}
	send(data: unknown): boolean {
		if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
			return false;
		}
		try {
			this._ws.send(typeof data === "string" ? data : JSON.stringify(data));
			return true;
		} catch {
			return false;
		}
	}
	get isConnected(): boolean {
		try {
			return this._ws?.readyState === WebSocket.OPEN;
		} catch {
			return false;
		}
	}
	get ws(): WebSocket | undefined {
		return this._ws;
	}
}
