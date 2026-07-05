import type { IncomingMessage } from "node:http";
import type { Server as HttpsServer } from "node:https";
import WebSocket, { WebSocketServer } from "ws";
import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import type { Dispatcher } from "../core/dispatcher";
import type { INcomingWssMessage } from "./wss-message.types";
import { WssPublisher } from "./wss-publisher";
import { WssRateLimiter } from "./wss-rate-limiter";
import { WssSubscriptionManager } from "./wss-subscription-manager";

const WSS_SHUTDOWN_TIMEOUT_MS = 5_000;

type MessageHandler = (
	msg: INcomingWssMessage,
	ws: WebSocket,
	ctx: {
		instanceId: string;
		serviceName: string;
		topics: Set<string>;
		subKey: string;
	}
) => Promise<void> | void;

export class WssTransport {
	private _wss: WebSocketServer | null = null;
	private _dispatcher: Dispatcher;
	private _rateLimiter = new WssRateLimiter();
	private _subscriptionManager = new WssSubscriptionManager();
	private _publisher: WssPublisher;

	constructor(dispatcher: Dispatcher) {
		this._dispatcher = dispatcher;
		this._publisher = new WssPublisher(dispatcher, this._rateLimiter);
	}

	attach(server: HttpsServer): void {
		this._rateLimiter.ensureCleanupTimer();
		this._wss = new WebSocketServer({
			server,
			path: "/ws",
			maxPayload: ENV.MAX_PAYLOAD_BYTES,
			verifyClient: (info, cb) => {
				const serviceName = info.req.headers["x-service-name"] as string;
				const instanceId = info.req.headers["x-instance-id"] as string;
				if (!(serviceName && instanceId)) {
					cb(false, 400, "Missing x-service-name or x-instance-id headers");
					return;
				}
				cb(true);
			},
		});

		this._wss.on("connection", (ws, req) => this._handleConnection(ws, req));

		logger.info("WSS transport attached at /ws");
	}

	private _parseConnectionHeaders(req: IncomingMessage): {
		serviceName: string;
		instanceId: string;
		topics: Set<string>;
	} {
		const serviceName = req.headers["x-service-name"] as string;
		const instanceId = req.headers["x-instance-id"] as string;
		const topicsHeader = req.headers["x-subscribed-topics"] as string;
		const topics = new Set(
			topicsHeader
				? topicsHeader
						.split(",")
						.map((part) => part.trim())
						.filter(Boolean)
				: []
		);
		return { serviceName, instanceId, topics };
	}

	private _handleConnection(ws: WebSocket, req: IncomingMessage): void {
		if (!this._subscriptionManager.enforceCapacity(ws)) {
			return;
		}

		const { serviceName, instanceId, topics } =
			this._parseConnectionHeaders(req);
		const subKey = this._subscriptionManager.add(ws, serviceName, instanceId, topics);

		logger.info("WSS client connecting", {
			serviceName,
			instanceId,
			topics: [...topics],
		});

		this._registerMessageHandler(ws, {
			instanceId,
			serviceName,
			topics,
			subKey,
		});
		this._registerCloseHandler(ws, subKey, serviceName, instanceId);
		this._registerErrorHandler(ws, serviceName, instanceId);

		ws.send(
			JSON.stringify({ type: "connected", instanceId: ENV.BROKER_INSTANCE_ID })
		);
	}

	private _registerMessageHandler(
		ws: WebSocket,
		ctx: {
			instanceId: string;
			serviceName: string;
			topics: Set<string>;
			subKey: string;
		}
	): void {
		ws.on("message", async (raw: WebSocket.RawData) => {
			const incoming = this._parseWsMessage(raw, ws);
			if (!incoming) {
				return;
			}

			const handler = this._buildHandlerMap().get(incoming.type);
			if (handler) {
				try {
					await handler(incoming, ws, ctx);
				} catch {
					ws.send(
						JSON.stringify({
							type: "error",
							message: "Server error processing message",
						})
					);
				}
			} else {
				ws.send(
					JSON.stringify({
						type: "error",
						message: `Unknown message type: ${incoming.type}`,
					})
				);
			}
		});
	}

	private _buildHandlerMap(): Map<string, MessageHandler> {
		return new Map<string, MessageHandler>([
			[
				"subscribe",
				(_msg, _ws, _ctx) =>
					this._subscriptionManager.handleSubscribe(
						_msg,
						_ws,
						_ctx.topics,
						_ctx.instanceId
					),
			],
			[
				"unsubscribe",
				(_msg, _ws, _ctx) =>
					this._subscriptionManager.handleUnsubscribe(
						_msg,
						_ws,
						_ctx.topics,
						_ctx.instanceId
					),
			],
			[
				"publish",
				(_msg, _ws, _ctx) =>
					this._publisher.handlePublish(_msg, _ws, _ctx),
			],
			["ack", (_msg, _ws, _ctx) => this._handleAck(_msg, _ws, _ctx)],
			["nack", (_msg, _ws, _ctx) => this._handleNack(_msg, _ws, _ctx)],
		]);
	}

	private _parseWsMessage(
		raw: WebSocket.RawData,
		ws: WebSocket
	): INcomingWssMessage | null {
		let msg: Record<string, unknown>;
		try {
			msg = JSON.parse(raw.toString());
		} catch {
			ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
			return null;
		}
		if (typeof msg.type !== "string") {
			ws.send(
				JSON.stringify({ type: "error", message: "Missing message type" })
			);
			return null;
		}

		return {
			type: msg.type,
			instanceId: msg.instanceId as string | undefined,
			topics: msg.topics as string[] | undefined,
			payload: msg.payload,
			metadata: msg.metadata,
			traceparent: msg.traceparent as string | undefined,
			messageId: msg.messageId as string | undefined,
		};
	}

	private _registerCloseHandler(
		ws: WebSocket,
		subKey: string,
		serviceName: string,
		instanceId: string
	): void {
		ws.on("close", () => {
			this._subscriptionManager.remove(subKey);
			ws.removeAllListeners();
			logger.info("WSS client disconnected", { serviceName, instanceId });
		});
	}

	private _registerErrorHandler(
		ws: WebSocket,
		serviceName: string,
		instanceId: string
	): void {
		ws.on("error", (err) => {
			logger.warn("WSS connection error", {
				error: err.message,
				serviceName,
				instanceId,
			});
			ws.close(1011, "Internal server error");
		});
	}

	private _handleAck(
		msg: INcomingWssMessage,
		ws: WebSocket,
		ctx: { instanceId: string }
	): void {
		if (typeof msg.messageId !== "string") {
			ws.send(
				JSON.stringify({ type: "error", message: "messageId must be a string" })
			);
			return;
		}
		this._dispatcher.handleAck(msg.messageId, ctx.instanceId).catch(() => {});
	}

	private _handleNack(
		msg: INcomingWssMessage,
		ws: WebSocket,
		ctx: { instanceId: string }
	): void {
		if (typeof msg.messageId !== "string") {
			ws.send(
				JSON.stringify({ type: "error", message: "messageId must be a string" })
			);
			return;
		}
		this._dispatcher.handleNack(msg.messageId, ctx.instanceId).catch(() => {});
	}

	getSubscriber(
		serviceName: string,
		instanceId: string
	): WebSocket | undefined {
		return this._subscriptionManager.get(serviceName, instanceId);
	}

	hasSubscriber(serviceName: string, instanceId: string): boolean {
		return this._subscriptionManager.has(serviceName, instanceId);
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
		if (this._wss) {
			for (const [, sub] of this._subscriptionManager.entries()) {
				sub.ws.close(1001, "Server shutdown");
			}
			this._subscriptionManager.clear();
			await new Promise<void>((resolve) => {
				const timer = setTimeout(() => {
					this._wss = null;
					resolve();
				}, WSS_SHUTDOWN_TIMEOUT_MS);
				this._wss!.close(() => {
					clearTimeout(timer);
					this._wss = null;
					resolve();
				});
			});
		}
		this._rateLimiter.shutdown();
		this._publisher.shutdown();
	}
}
