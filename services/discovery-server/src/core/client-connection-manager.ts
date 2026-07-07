import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
import WebSocket from "ws";

const CLIENT_TIMEOUT_MS = 60_000;

export interface ConnectedClient {
	ws: WebSocket;
	subscribedServices: Set<string>;
	instanceId?: string;
	serviceName?: string;
}

export class ClientConnectionManager {
	private readonly _clients = new Map<string, ConnectedClient>();
	private readonly _clientTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

	add(clientId: string, client: ConnectedClient): void {
		this._clients.set(clientId, client);
		this.resetTimeout(clientId, client.ws);
	}
	remove(clientId: string): void {
		this._clients.delete(clientId);
		this._clearTimeout(clientId);
		this._clientTimeouts.delete(clientId);
	}
	get(clientId: string): ConnectedClient | undefined { return this._clients.get(clientId); }
	[Symbol.iterator](): IterableIterator<[string, ConnectedClient]> { return this._clients[Symbol.iterator](); }
	isSubscribed(client: ConnectedClient, serviceName: string): boolean {
		return client.subscribedServices.has("*") || client.subscribedServices.has(serviceName);
	}
	sendToClient(clientId: string, client: ConnectedClient, message: string): void {
		if (client.ws.readyState !== WebSocket.OPEN) return;
		try { client.ws.send(message); } catch (error) { logger.warn("Failed to send message to client", { clientId, err: normalizeError(error) }); }
	}
	broadcast(serviceName: string, message: string): void {
		for (const [clientId, client] of this._clients) { if (this.isSubscribed(client, serviceName)) this.sendToClient(clientId, client, message); }
	}
	resetTimeout(clientId: string, ws: WebSocket): void {
		this._clearTimeout(clientId);
		const timer = setTimeout(() => this._onTimeout(clientId, ws), CLIENT_TIMEOUT_MS);
		this._clientTimeouts.set(clientId, timer);
	}
	clearAll(): void {
		for (const [clientId, client] of this._clients) { client.ws.close(); this._clearTimeout(clientId); }
		this._clients.clear();
		this._clientTimeouts.clear();
	}
	private _clearTimeout(clientId: string): void {
		const timeout = this._clientTimeouts.get(clientId);
		if (timeout) clearTimeout(timeout);
	}
	private _onTimeout(clientId: string, ws: WebSocket): void {
		logger.warn("Discovery WS client timed out", { clientId });
		ws.close();
		this._clients.delete(clientId);
		this._clientTimeouts.delete(clientId);
	}
}
