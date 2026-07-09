import type { IncomingMessage } from "node:http";
import type { Server as HttpsServer } from "node:https";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type WebSocket from "ws";
import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import type { Dispatcher } from "../core/dispatcher";
import { WssConnectionHandler } from "./wss-connection-handler";
import { WssMessageRouter } from "./wss-message-router";
import { WssPublisher } from "./wss-publisher";
import { WssRateLimiter } from "./wss-rate-limiter";
import { WssSubscriptionManager } from "./wss-subscription-manager";

export class WssTransport {
	private _connectionHandler: WssConnectionHandler;
	private _messageRouter: WssMessageRouter;
	private _rateLimiter = new WssRateLimiter();
	private _subscriptionManager = new WssSubscriptionManager();
	private _publisher: WssPublisher;

	constructor(dispatcher: Dispatcher) {
		this._publisher = new WssPublisher(dispatcher, this._rateLimiter);
		this._messageRouter = new WssMessageRouter(
			dispatcher,
			this._subscriptionManager,
			this._publisher
		);
		this._connectionHandler = new WssConnectionHandler(
			this._subscriptionManager,
			this._rateLimiter
		);
	}

	attach(server: HttpsServer): void {
		this._connectionHandler.attach(server, (ws, req) =>
			this._handleConnection(ws, req)
		);
	}

	private _handleConnection(ws: WebSocket, req: IncomingMessage): void {
		if (!this._subscriptionManager.enforceCapacity(ws)) {
			return;
		}
		if (!this._tryRegisterConnection(ws, req)) {
		}
	}

	private _tryRegisterConnection(ws: WebSocket, req: IncomingMessage): boolean {
		const ctx = this._buildConnectionContext(ws, req);
		if (!ctx) {
			return false;
		}
		this._logConnection(ctx);
		this._setupConnectionHandlers(ws, ctx);
		this._sendConnectedResponse(ws);
		return true;
	}

	private _logConnection(ctx: {
		subKey: string;
		identity: ServiceIdentity;
		topics: Set<string>;
	}): void {
		const { identity } = ctx;
		logger.info("WSS client connecting", {
			context: {
				serviceName: identity.serviceName,
				instanceId: identity.instanceId,
				topics: [...ctx.topics],
			},
		});
	}

	private _setupConnectionHandlers(
		ws: WebSocket,
		ctx: { subKey: string; identity: ServiceIdentity; topics: Set<string> }
	): void {
		this._messageRouter.registerMessageHandler(ws, ctx);
		this._connectionHandler.registerCloseHandler(ws, ctx.subKey, ctx.identity);
		this._connectionHandler.registerErrorHandler(ws, ctx.identity);
	}

	private _sendConnectedResponse(ws: WebSocket): void {
		ws.send(
			JSON.stringify({ type: "connected", instanceId: ENV.BROKER_INSTANCE_ID })
		);
	}

	private _buildConnectionContext(
		ws: WebSocket,
		req: IncomingMessage
	): { subKey: string; identity: ServiceIdentity; topics: Set<string> } | null {
		const { identity, topics } =
			this._connectionHandler.parseConnectionHeaders(req);
		const subKey = this._subscriptionManager.add({ ws, identity, topics });
		return { subKey, identity, topics };
	}

	getSubscriber(identity: ServiceIdentity): WebSocket | undefined {
		return this._subscriptionManager.get(identity);
	}

	hasSubscriber(identity: ServiceIdentity): boolean {
		return this._subscriptionManager.has(identity);
	}

	getConnectedCount(): number {
		return this._subscriptionManager.size;
	}

	broadcastToTopic(topic: string, message: unknown): number {
		return this._subscriptionManager.broadcastToTopic(topic, message);
	}

	broadcast(message: unknown): void {
		this._subscriptionManager.broadcast(message);
	}

	async shutdown(): Promise<void> {
		await this._connectionHandler.shutdown();
		this._rateLimiter.shutdown();
		this._publisher.shutdown();
	}
}
