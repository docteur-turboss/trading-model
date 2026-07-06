import type https from "node:https";
import { logger } from "@trading-model/common/config/logger";
import type { DiscoveryWsClientMessage, DiscoveryWsHeartbeatMessage, DiscoveryWsSubscribeMessage } from "@trading-model/common/contracts/discovery-ws-message.types";
import { normalizeError } from "@trading-model/common/utils/errors";
import WebSocket, { WebSocketServer } from "ws";
import { ClientConnectionManager } from "./client-connection-manager";
import type { ConnectedClient } from "./client-connection-manager";

interface WsDiscoveryServerOptions {
	path?: string;
}

export class WsDiscoveryServer {
	private _wss: WebSocketServer | null = null;
	private readonly _path: string;
	private readonly _clientManager = new ClientConnectionManager();

	constructor(options?: WsDiscoveryServerOptions) {
		this._path = options?.path ?? "/ws";
	}

	attach(rawServer: https.Server): void {
		this._wss = new WebSocketServer({ noServer: true });
		this._setupUpgradeHandler(rawServer);
		this._setupConnectionHandler();
	}

	private _setupUpgradeHandler(rawServer: https.Server): void {
		rawServer.on("upgrade", (request, socket, head) => {
			if (request.url?.startsWith(this._path)) {
				this._wss!.handleUpgrade(request, socket, head, (ws, req) => {
					this._wss!.emit("connection", ws, req);
				});
			}
		});
	}

	private _setupConnectionHandler(): void {
		this._wss!.on("connection", (ws: WebSocket, req) => {
			const clientId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
			logger.info("Discovery WS client connected", { clientId });

			const client: ConnectedClient = { ws, subscribedServices: new Set() };
			this._clientManager.add(clientId, client);

			ws.on("message", (data) => this._onWsMessage(clientId, client, data));
			ws.on("close", () => this._onWsClose(clientId));
			ws.on("error", (error) => this._onWsError(clientId, error));
		});
	}

	private _onWsMessage(
		clientId: string,
		client: ConnectedClient,
		data: WebSocket.Data
	): void {
		try {
			const parsed = JSON.parse(data.toString()) as {
				type: string;
				payload?: Record<string, unknown>;
			};
			this._handleMessage(clientId, client, parsed as DiscoveryWsClientMessage);
		} catch (error) {
			logger.warn("Failed to parse WS message", {
				clientId,
				err: normalizeError(error),
			});
		}
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

	private _handleSubscribe(
		clientId: string,
		client: ConnectedClient,
		message: { type: "subscribe"; payload?: { services?: string[] } }
	): void {
		const services = message.payload?.services;
		if (Array.isArray(services)) {
			for (const svc of services) {
				client.subscribedServices.add(String(svc));
			}
		} else {
			client.subscribedServices.add("*");
		}
		logger.info("Discovery WS client subscribed", {
			clientId,
			services: [...client.subscribedServices],
		});
	}

	private _handleHeartbeat(
		client: ConnectedClient,
		message: { type: "heartbeat"; payload?: { serviceName?: string; instanceId?: string } }
	): void {
		if (message.payload?.serviceName) {
			client.serviceName = message.payload.serviceName;
		}
		if (message.payload?.instanceId) {
			client.instanceId = message.payload.instanceId;
		}
	}

	private readonly _messageHandlers: Record<
		string,
		(clientId: string, client: ConnectedClient, message: DiscoveryWsClientMessage) => void
	> = {
		subscribe: (clientId, client, message) =>
			this._handleSubscribe(clientId, client, message as never),
		heartbeat: (_clientId, client, message) =>
			this._handleHeartbeat(client, message as never),
	};

	private _handleMessage(
		clientId: string,
		client: ConnectedClient,
		message: DiscoveryWsClientMessage
	): void {
		const handler = this._messageHandlers[message.type];
		if (handler) {
			handler(clientId, client, message);
		} else {
			logger.debug("Unknown WS message type", {
				clientId,
				type: (message as { type: string }).type,
			});
		}
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
		this._wss = null;
	}
}
