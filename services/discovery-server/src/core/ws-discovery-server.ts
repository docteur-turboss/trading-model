import type { IncomingMessage } from "node:http";
import type https from "node:https";
import type WebSocket from "ws";
import { WebSocketServer } from "ws";
import { ClientConnectionManager } from "./client-connection-manager";
import { WsProtocolHandler } from "./ws-protocol-handler";

interface WssServerLike {
	on(
		event: "connection",
		listener: (ws: WebSocket, req: IncomingMessage) => void
	): void;
	close(callback?: () => void): void;
}

interface WsDiscoveryServerOptions {
	path?: string;
}

export class WsDiscoveryServer {
	private _wss: WssServerLike | undefined;
	private readonly _path: string;
	private readonly _clientManager = new ClientConnectionManager();
	private readonly _protocolHandler: WsProtocolHandler;

	constructor(options?: WsDiscoveryServerOptions) {
		this._path = options?.path ?? "/ws";
		this._protocolHandler = new WsProtocolHandler(this._clientManager);
	}

	attach(rawServer: https.Server): void {
		this._wss = new WebSocketServer({ noServer: true });
		this._protocolHandler.setupUpgradeHandler(rawServer, this._wss, this._path);
		this._protocolHandler.setupConnectionHandler(this._wss);
	}

	notifyServiceChanged(serviceName: string): void {
		this._broadcastInvalidation(serviceName);
	}

	notifyInstanceRemoved(serviceName: string, _instanceId: string): void {
		this._broadcastInvalidation(serviceName);
	}

	private _broadcastInvalidation(serviceName: string): void {
		const message = JSON.stringify({
			type: "cache.invalidate",
			payload: { serviceName },
		});
		this._clientManager.broadcast(serviceName, message);
	}

	stop(): void {
		this._clientManager.clearAll();
		this._wss?.close();
	}
}
