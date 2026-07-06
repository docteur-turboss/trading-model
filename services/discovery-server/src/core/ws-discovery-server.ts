import type https from "node:https";
import WebSocket, { WebSocketServer } from "ws";
import { ClientConnectionManager } from "./client-connection-manager";
import { WsProtocolHandler } from "./ws-protocol-handler";

interface WsDiscoveryServerOptions {
	path?: string;
}

export class WsDiscoveryServer {
	private _wss!: WebSocketServer;
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
		this._wss.close();
	}
}
