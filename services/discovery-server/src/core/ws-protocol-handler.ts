import type https from "node:https";
import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
import type { WebSocketServer } from "ws";
import type { ClientConnectionManager } from "../adapters/inbound/client-connection-manager";
import { WsConnectionSetup } from "./ws-connection-setup";
import { WsMessageDispatcher } from "./ws-message-dispatcher";

export class WsProtocolHandler {
	private readonly _setup: WsConnectionSetup;
	private readonly _dispatcher: WsMessageDispatcher;

	constructor(private readonly _clientManager: ClientConnectionManager) {
		this._dispatcher = new WsMessageDispatcher();
		this._setup = new WsConnectionSetup(
			_clientManager,
			(clientId, client, data) =>
				this._dispatcher.handleMessage(clientId, client, data),
			(clientId) => this._onWsClose(clientId),
			(clientId, error) => this._onWsError(clientId, error)
		);
	}

	setupUpgradeHandler(
		rawServer: https.Server,
		wss: WebSocketServer,
		path: string
	): void {
		this._setup.setupUpgradeHandler(rawServer, wss, path);
	}

	setupConnectionHandler(wss: WebSocketServer): void {
		this._setup.setupConnectionHandler(wss);
	}

	private _onWsClose(clientId: string): void {
		this._clientManager.remove(clientId);
		logger.info("Discovery WS client disconnected", { clientId });
	}

	private _onWsError(clientId: string, error: unknown): void {
		logger.warn("Discovery WS client error", {
			clientId,
			err: normalizeError(error),
		});
	}
}
