import WebSocket from "ws";

import { logger } from "@trading-model/common/config/logger";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import {
	createWsConnectTimeout,
} from "@trading-model/common/utils/ws-reconnect";
import { TlsConfigBuilder } from "./tls-config-builder";

export class WsConnectionManager {
	private _ws!: WebSocket;
	private readonly _tlsBuilder: TlsConfigBuilder;

	constructor(
		private readonly _url: string,
		tlsConfig?: TlsPaths,
	) {
		this._tlsBuilder = new TlsConfigBuilder(tlsConfig);
	}

	connect(
		onOpen: () => void,
		onMessage: (data: WebSocket.Data) => void,
		onClose: () => void,
		onError: (err: Error) => void,
		onTimeout: () => void,
	): void {
		try {
			this._ws = new WebSocket(this._url, this._tlsBuilder.build());
			this._ws.binaryType = "nodebuffer";

			const cancelTimeout = this._setupConnectTimeout(onTimeout);
			this._registerWsEventHandlers(onOpen, onMessage, onClose, onError, cancelTimeout);
		} catch (err) {
			logger.error("Failed to create WSS connection", { err });
			onTimeout();
		}
	}

	private _setupConnectTimeout(onTimeout: () => void): () => void {
		return createWsConnectTimeout(() => {
			logger.warn("WSS connection timeout");
			this._ws.close();
			onTimeout();
		}, 10_000);
	}

	private _registerWsEventHandlers(
		onOpen: () => void,
		onMessage: (data: WebSocket.Data) => void,
		onClose: () => void,
		onError: (err: Error) => void,
		cancelTimeout: () => void,
	): void {

		this._ws.on("open", () => {
			cancelTimeout();
			onOpen();
		});

		this._ws.on("message", (data: WebSocket.Data) => {
			onMessage(data);
		});

		this._ws.on("close", () => {
			cancelTimeout();
			onClose();
		});

		this._ws.on("error", (err: Error) => {
			cancelTimeout();
			logger.error("WSS transport error", { err: err.message });
			onError(err);
		});
	}

	cleanup(): void {
		try {
			this._ws.removeAllListeners();
			this._ws.close();
		} catch {
			/* closing gracefully */
		}
	}

	get ws(): WebSocket {
		return this._ws;
	}
}
