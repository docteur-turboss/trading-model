import type { IncomingMessage } from "node:http";
import type { Server as HttpsServer } from "node:https";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type WebSocket from "ws";
import { ClientVerifier } from "./client-verifier";
import { ConnectionEventHandler } from "./connection-event-handler";
import type { WssRateLimiter } from "./wss-rate-limiter";
import { WssServerLifecycle } from "./wss-server-lifecycle";
import type { WssSubscriptionManager } from "./wss-subscription-manager";

export class WssConnectionHandler {
	private readonly _serverLifecycle: WssServerLifecycle;
	private readonly _clientVerifier = new ClientVerifier();
	private readonly _connectionEventHandler: ConnectionEventHandler;

	constructor(
		subscriptionManager: WssSubscriptionManager,
		rateLimiter: WssRateLimiter
	) {
		this._serverLifecycle = new WssServerLifecycle(this._clientVerifier);
		this._connectionEventHandler = new ConnectionEventHandler(subscriptionManager);
	}

	attach(
		server: HttpsServer,
		onConnection: (ws: WebSocket, req: IncomingMessage) => void
	): void {
		this._serverLifecycle.attach(server, onConnection);
	}

	parseConnectionHeaders(req: IncomingMessage): {
		identity: ServiceIdentity;
		topics: Set<string>;
	} {
		return this._clientVerifier.parseConnectionHeaders(req);
	}

	registerCloseHandler(
		ws: WebSocket,
		subKey: string,
		identity: ServiceIdentity
	): void {
		this._connectionEventHandler.registerCloseHandler(ws, subKey, identity);
	}

	registerErrorHandler(ws: WebSocket, identity: ServiceIdentity): void {
		this._connectionEventHandler.registerErrorHandler(ws, identity);
	}

	async shutdown(): Promise<void> {
		await this._serverLifecycle.shutdown();
	}
}
