import WebSocket from "ws";

import { logger } from "@trading-model/common/config/logger";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import { isWsConnected } from "@trading-model/common/domain/ws-connection";
import {
	createWsConnectTimeout,
} from "@trading-model/common/utils/ws-reconnect";
import { TlsConfigBuilder } from "./tls-config-builder";

export class WsConnectionManager {
	private _ws: WebSocket | null = null;
	private readonly _tlsBuilder: TlsConfigBuilder;

	constructor(
		private readonly _url: string,
		tlsConfig?: TlsPaths,
		private readonly _bootstrapToken?: string
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
			if (this._ws) {
				this._ws.close();
			}
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
		if (!this._ws) return;

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

	sendWsAuth(): void {
		const token = this._bootstrapToken;
		if (
			!token ||
			token.length === 0 ||
			!isWsConnected(this._ws)
		) {
			return;
		}
		this._ws.send(
			JSON.stringify({
				type: "auth",
				token,
			}),
			(err) => {
				if (err) {
					logger.error("Failed to send WSS auth message", { err: err.message });
				}
			}
		);
	}

	cleanup(): void {
		if (this._ws) {
			try {
				this._ws.removeAllListeners();
				this._ws.close();
			} catch {
				/* closing gracefully */
			}
			this._ws = null;
		}
	}

	get ws(): WebSocket | null {
		return this._ws;
	}
}
