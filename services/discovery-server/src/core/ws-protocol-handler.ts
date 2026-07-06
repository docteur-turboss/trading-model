import { logger } from "@trading-model/common/config/logger";
import type {
	DiscoveryWsClientMessage,
	DiscoveryWsHeartbeatMessage,
	DiscoveryWsSubscribeMessage,
} from "@trading-model/common/contracts/discovery-ws-message.types";
import { normalizeError } from "@trading-model/common/utils/errors";
import type https from "node:https";
import WebSocket, { WebSocketServer } from "ws";
import type { ConnectedClient } from "./client-connection-manager";
import { ClientConnectionManager } from "./client-connection-manager";

export class WsProtocolHandler {
	constructor(
		private readonly _clientManager: ClientConnectionManager,
	) {}

	setupUpgradeHandler(
		rawServer: https.Server,
		wss: WebSocketServer,
		path: string,
	): void {
		rawServer.on("upgrade", (request, socket, head) => {
			if (request.url?.startsWith(path)) {
				wss.handleUpgrade(request, socket, head, (ws, req) => {
					wss.emit("connection", ws, req);
				});
			}
		});
	}

	setupConnectionHandler(wss: WebSocketServer): void {
		wss.on("connection", (ws: WebSocket, req) => {
			const clientId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
			logger.info("Discovery WS client connected", { clientId });

			const client: ConnectedClient = {
				ws,
				subscribedServices: new Set(),
			};
			this._clientManager.add(clientId, client);

			ws.on("message", (data) => this._onWsMessage(clientId, client, data));
			ws.on("close", () => this._onWsClose(clientId));
			ws.on("error", (error) => this._onWsError(clientId, error));
		});
	}

	private _onWsMessage(
		clientId: string,
		client: ConnectedClient,
		data: WebSocket.Data,
	): void {
		try {
			const parsed = JSON.parse(data.toString()) as {
				type: string;
				payload?: Record<string, unknown>;
			};
			this._handleMessage(
				clientId,
				client,
				parsed as DiscoveryWsClientMessage,
			);
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
		message: DiscoveryWsSubscribeMessage,
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
		message: DiscoveryWsHeartbeatMessage,
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
		(
			clientId: string,
			client: ConnectedClient,
			message: DiscoveryWsClientMessage,
		) => void
	> = {
		subscribe: (clientId, client, message) =>
			this._handleSubscribe(clientId, client, message as never),
		heartbeat: (_clientId, client, message) =>
			this._handleHeartbeat(client, message as never),
	};

	private _handleMessage(
		clientId: string,
		client: ConnectedClient,
		message: DiscoveryWsClientMessage,
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
}
