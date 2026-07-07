import { logger } from "@trading-model/common/config/logger";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import { createWsConnectTimeout } from "@trading-model/common/utils/ws-reconnect";
import type { IWsConnection } from "@trading-model/common/ws/i-ws-connection";
import WebSocket from "ws";
import { TlsConfigBuilder } from "./tls-config-builder";

export class WsConnectionManager implements IWsConnection {
	private _ws: WebSocket | undefined;
	private readonly _tlsBuilder: TlsConfigBuilder;

	onCloseHandler?: () => void;

	constructor(
		private readonly _url: string,
		tlsConfig?: TlsPaths
	) {
		this._tlsBuilder = new TlsConfigBuilder(tlsConfig);
	}

	connect(): void {
		try {
			const ws = new WebSocket(this._url, this._tlsBuilder.build());
			ws.binaryType = "nodebuffer";
			this._ws = ws;
			this._setupInternalHandlers(ws);
		} catch (err) {
			logger.error("Failed to create WSS connection", { err });
		}
	}

	connectWithCallbacks(
		onOpen: () => void,
		onMessage: (data: WebSocket.Data) => void,
		onClose: () => void,
		onError: (err: Error) => void,
		onTimeout: () => void
	): void {
		try {
			const ws = new WebSocket(this._url, this._tlsBuilder.build());
			ws.binaryType = "nodebuffer";
			this._ws = ws;

			const cancelTimeout = this._setupConnectTimeout(onTimeout, ws);
			this._registerWsEventHandlers(
				onOpen,
				onMessage,
				onClose,
				onError,
				cancelTimeout,
				ws
			);
		} catch (err) {
			logger.error("Failed to create WSS connection", { err });
			onTimeout();
		}
	}

	private _setupInternalHandlers(ws: WebSocket): void {
		ws.on("open", () => {
			/* connected */
		});

		ws.on("message", (_data: WebSocket.Data) => {
			/* message received */
		});

		ws.on("close", () => {
			this.onCloseHandler?.();
		});

		ws.on("error", (err: Error) => {
			logger.error("WSS transport error", { err: err.message });
		});
	}

	private _setupConnectTimeout(
		onTimeout: () => void,
		ws: WebSocket
	): () => void {
		return createWsConnectTimeout(() => {
			logger.warn("WSS connection timeout");
			ws.close();
			onTimeout();
		}, 10_000);
	}

	private _registerWsEventHandlers(
		onOpen: () => void,
		onMessage: (data: WebSocket.Data) => void,
		onClose: () => void,
		onError: (err: Error) => void,
		cancelTimeout: () => void,
		ws: WebSocket
	): void {
		ws.on("open", () => {
			cancelTimeout();
			onOpen();
		});

		ws.on("message", (data: WebSocket.Data) => {
			onMessage(data);
		});

		ws.on("close", () => {
			cancelTimeout();
			onClose();
		});

		ws.on("error", (err: Error) => {
			cancelTimeout();
			logger.error("WSS transport error", { err: err.message });
			onError(err);
		});
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
