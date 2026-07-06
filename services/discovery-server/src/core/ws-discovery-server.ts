import type https from "node:https";
import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
import WebSocket, { WebSocketServer } from "ws";

const CLIENT_TIMEOUT_MS = 60_000;

type WsDiscoveryClientMessage =
	| { type: "subscribe"; payload?: { services?: string[] } }
	| { type: "heartbeat"; payload?: { serviceName?: string; instanceId?: string } };

interface ConnectedClient {
	ws: WebSocket;
	subscribedServices: Set<string>;
	instanceId?: string;
	serviceName?: string;
}

interface WsDiscoveryServerOptions {
	path?: string;
}

export class WsDiscoveryServer {
	private _wss: WebSocketServer | null = null;
	private readonly _path: string;
	private readonly _clients = new Map<string, ConnectedClient>();
	private readonly _clientTimeouts = new Map<
		string,
		ReturnType<typeof setTimeout>
	>();

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
			this._clients.set(clientId, client);
			this._resetClientTimeout(clientId, ws);

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
			this._handleMessage(clientId, client, parsed as WsDiscoveryClientMessage);
		} catch (error) {
			logger.warn("Failed to parse WS message", {
				clientId,
				err: normalizeError(error),
			});
		}
	}

	private _onWsClose(clientId: string): void {
		this._clients.delete(clientId);
		const timeout = this._clientTimeouts.get(clientId);
		if (timeout) {
			clearTimeout(timeout);
		}
		this._clientTimeouts.delete(clientId);
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

	private _handleMessage(
		clientId: string,
		client: ConnectedClient,
		message: WsDiscoveryClientMessage
	): void {
		switch (message.type) {
			case "subscribe":
				this._handleSubscribe(clientId, client, message);
				break;
			case "heartbeat":
				this._handleHeartbeat(client, message);
				break;
			default:
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

	private _isSubscribed(client: ConnectedClient, serviceName: string): boolean {
		return client.subscribedServices.has("*") || client.subscribedServices.has(serviceName);
	}

	private _sendToClient(clientId: string, client: ConnectedClient, message: string): void {
		if (client.ws.readyState !== WebSocket.OPEN) return;
		try {
			client.ws.send(message);
		} catch (error) {
			logger.warn("Failed to send cache.invalidate to client", { clientId, err: normalizeError(error) });
		}
	}

	private _broadcastInvalidation(serviceName: string): void {
		const message = JSON.stringify({ type: "cache.invalidate", payload: { serviceName } });
		for (const [clientId, client] of this._clients) {
			if (this._isSubscribed(client, serviceName)) {
				this._sendToClient(clientId, client, message);
			}
		}
	}

	private _resetClientTimeout(clientId: string, ws: WebSocket): void {
		const existing = this._clientTimeouts.get(clientId);
		if (existing) {
			clearTimeout(existing);
		}
		this._clientTimeouts.set(
			clientId,
			setTimeout(() => {
				logger.warn("Discovery WS client timed out", { clientId });
				ws.close();
				this._clients.delete(clientId);
				this._clientTimeouts.delete(clientId);
			}, CLIENT_TIMEOUT_MS)
		);
	}

	stop(): void {
		for (const [clientId, client] of this._clients) {
			client.ws.close();
			const timeout = this._clientTimeouts.get(clientId);
			if (timeout) {
				clearTimeout(timeout);
			}
		}
		this._clients.clear();
		this._clientTimeouts.clear();
		this._wss?.close();
		this._wss = null;
	}
}
