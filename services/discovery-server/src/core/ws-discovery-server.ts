import type https from "node:https";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { InstanceId } from "@trading-model/common/domain/primitives";
import type { WebSocketServer as WssServerLike } from "ws";
import { WebSocketServer } from "ws";
import { ClientConnectionManager } from "../adapters/inbound/client-connection-manager";
import { WsProtocolHandler } from "./ws-protocol-handler";

interface WsDiscoveryServerOptions {
	path?: string;
}

export class WsDiscoveryServer {
	private readonly _path: string;
	private readonly _clientManager = new ClientConnectionManager();
	private readonly _protocolHandler: WsProtocolHandler;

	constructor(options?: WsDiscoveryServerOptions) {
		this._path = options?.path ?? "/ws";
		this._protocolHandler = new WsProtocolHandler(this._clientManager);
	}

	attach(rawServer: https.Server): WssServerLike {
		const wss = new WebSocketServer({ noServer: true });
		this._protocolHandler.setupUpgradeHandler(rawServer, wss, this._path);
		this._protocolHandler.setupConnectionHandler(wss);
		return wss;
	}

	notifyServiceChanged(serviceName: ServiceInstanceName): void {
		this._broadcastInvalidation(serviceName);
	}

	notifyInstanceRemoved(
		serviceName: ServiceInstanceName,
		_instanceId: InstanceId
	): void {
		this._broadcastInvalidation(serviceName);
	}

	private _broadcastInvalidation(serviceName: ServiceInstanceName): void {
		const message = JSON.stringify({
			type: "cache.invalidate",
			payload: { serviceName },
		});
		this._clientManager.broadcast(serviceName, message);
	}

	stop(wss: WssServerLike): void {
		this._clientManager.clearAll();
		wss.close();
	}
}
