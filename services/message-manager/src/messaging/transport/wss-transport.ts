import type { IncomingMessage } from "node:http";
import type { Server as HttpsServer } from "node:https";
import { context, propagation } from "@opentelemetry/api";
import type { MessageMetadata } from "@trading-model/common/contracts/message.types";
import { LruCache } from "@trading-model/common/utils/lru-cache";
import WebSocket, { WebSocketServer } from "ws";
import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { getStreamClient } from "../../config/redis";
import { authorizeTopic } from "../core/acl";
import type { Dispatcher } from "../core/dispatcher";
import { Deque } from "./deque";

interface WsSubscription {
	instanceId: string;
	serviceName: string;
	topics: Set<string>;
	ws: WebSocket;
}

const MAX_WSS_CONNECTIONS = 10000;
const WSS_RATE_LIMIT_WINDOW_MS = 60_000;
const WSS_RATE_LIMIT_MAX_PER_WINDOW = 10000;
const WSS_RATE_LIMIT_CLEANUP_INTERVAL_MS = 60_000;
const WSS_SERVICE_STALE_MS = 120_000;
const WSS_SHUTDOWN_TIMEOUT_MS = 5_000;

interface RateLimitEntry {
	timestamps: Deque<number>;
	lastSeen: number;
}

interface INcomingWssMessage {
	type: string;
	instanceId?: string;
	topics?: string[];
	payload?: unknown;
	metadata?: unknown;
	traceparent?: string;
	messageId?: string;
}

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
	private _subscriptions = new Map<string, WsSubscription>();
	private _dispatcher: Dispatcher;
	private _cleanupTimer: ReturnType<typeof setInterval> | null = null;
	private _processedWssDeduplicationIds = new LruCache<true>(50000, 300_000);
	private _rateLimitWindows = new Map<string, RateLimitEntry>();

	constructor(dispatcher: Dispatcher) {
		this._dispatcher = dispatcher;
	}

	private _checkWssRateLimit(serviceName: string): boolean {
		const now = Date.now();
		let entry = this._rateLimitWindows.get(serviceName);
		if (!entry) {
			entry = { timestamps: new Deque<number>(), lastSeen: now };
			this._rateLimitWindows.set(serviceName, entry);
		}

		entry.lastSeen = now;
		const { timestamps } = entry;
		const cutoff = now - WSS_RATE_LIMIT_WINDOW_MS;
		while (timestamps.length > 0 && timestamps.peekFront()! < cutoff) {
			timestamps.shift();
		}

		if (timestamps.length >= WSS_RATE_LIMIT_MAX_PER_WINDOW) {
			return false;
		}

		timestamps.push(now);
		return true;
	}

	private _ensureCleanupTimer(): void {
		if (this._cleanupTimer) {
			return;
		}
		this._cleanupTimer = setInterval(() => {
			const now = Date.now();
			const cutoff = now - WSS_RATE_LIMIT_WINDOW_MS;
			const staleCutoff = now - WSS_SERVICE_STALE_MS;
			for (const [key, entry] of this._rateLimitWindows) {
				const { timestamps } = entry;
				while (timestamps.length > 0 && timestamps.peekFront()! < cutoff) {
					timestamps.shift();
				}
				if (timestamps.length === 0 && entry.lastSeen < staleCutoff) {
					this._rateLimitWindows.delete(key);
				}
			}
		}, WSS_RATE_LIMIT_CLEANUP_INTERVAL_MS);
		this._cleanupTimer.unref();
	}

	// ─── Dispatch table handlers for WSS message types ──────────────────────

	private _handleSubscribe(
		msg: INcomingWssMessage,
		ws: WebSocket,
		ctx: { instanceId: string; topics: Set<string> }
	): void {
		const msgInstanceId = msg.instanceId;
		if (msgInstanceId && msgInstanceId !== ctx.instanceId) {
			ws.send(
				JSON.stringify({ type: "error", message: "instanceId mismatch" })
			);
			return;
		}
		const rawTopics = msg.topics;
		if (
			!(
				Array.isArray(rawTopics) &&
				rawTopics.every((topic) => typeof topic === "string")
			)
		) {
			ws.send(
				JSON.stringify({
					type: "error",
					message: "topics must be an array of strings",
				})
			);
			return;
		}
		for (const topic of rawTopics as string[]) {
			ctx.topics.add(topic);
		}
		ws.send(JSON.stringify({ type: "subscribed", topics: [...ctx.topics] }));
	}

	private _handleUnsubscribe(
		msg: INcomingWssMessage,
		ws: WebSocket,
		ctx: { instanceId: string; topics: Set<string> }
	): void {
		const msgInstanceId = msg.instanceId;
		if (msgInstanceId && msgInstanceId !== ctx.instanceId) {
			ws.send(
				JSON.stringify({ type: "error", message: "instanceId mismatch" })
			);
			return;
		}
		const rawTopics = msg.topics;
		if (
			!(
				Array.isArray(rawTopics) &&
				rawTopics.every((topic) => typeof topic === "string")
			)
		) {
			ws.send(
				JSON.stringify({
					type: "error",
					message: "topics must be an array of strings",
				})
			);
			return;
		}
		for (const topic of rawTopics as string[]) {
			ctx.topics.delete(topic);
		}
		ws.send(JSON.stringify({ type: "unsubscribed", topics: [...ctx.topics] }));
	}

	private async _handlePublish(
		msg: INcomingWssMessage,
		ws: WebSocket,
		ctx: { instanceId: string; serviceName: string }
	): Promise<void> {
		if (!this._checkWssRateLimit(ctx.serviceName)) {
			ws.send(
				JSON.stringify({ type: "error", message: "Rate limit exceeded" })
			);
			return;
		}
		const topic = (msg.metadata as Record<string, unknown>)?.topic as
			| string
			| undefined;
		if (topic) {
			const result = await authorizeTopic(
				{ headers: { "x-service-name": ctx.serviceName } } as never,
				topic
			);
			if (!result.allowed) {
				ws.send(JSON.stringify({ type: "error", message: result.reason }));
				return;
			}
		}
		const wssMetadata = msg.metadata as Record<string, unknown> | undefined;
		const dedupId = (
			wssMetadata?.delivery as Record<string, unknown> | undefined
		)?.deduplicationId as string | undefined;
		if (dedupId) {
			if (this._processedWssDeduplicationIds.has(dedupId)) {
				return;
			}
			this._processedWssDeduplicationIds.set(dedupId, true);
			try {
				const redis = await getStreamClient();
				const key = `${ENV.REDIS_PREFIX}wss-dedup:${dedupId}`;
				const acquired = await redis.set(key, "1", "EX", 300, "NX");
				if (!acquired) {
					return;
				}
			} catch {
				/* Redis unavailable — local cache suffices */
			}
		}
		const bpRatio = this._dispatcher.getBackpressureRatio();
		if (bpRatio > 0.9) {
			ws.send(
				JSON.stringify({
					type: "error",
					message: "Server backpressure too high — try again later",
				})
			);
			return;
		}
		try {
			const traceparent = msg.traceparent as string | undefined;
			let publishPromise: Promise<string>;
			if (traceparent) {
				const carrier = { traceparent };
				const extractedCtx = propagation.extract(context.active(), carrier);
				publishPromise = context.with(extractedCtx, () =>
					this._dispatcher.publish(
						msg.payload,
						msg.metadata as Omit<MessageMetadata, "messageId" | "emittedAt">
					)
				);
			} else {
				publishPromise = this._dispatcher.publish(
					msg.payload,
					msg.metadata as Omit<MessageMetadata, "messageId" | "emittedAt">
				);
			}
			const messageId = await publishPromise;
			ws.send(JSON.stringify({ type: "published", messageId }));
		} catch (err) {
			logger.warn("WSS publish error", { error: (err as Error).message });
			ws.send(JSON.stringify({ type: "error", message: "Publish failed" }));
		}
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

	attach(server: HttpsServer): void {
		this._ensureCleanupTimer();
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

		this._wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
			if (this._subscriptions.size >= MAX_WSS_CONNECTIONS) {
				ws.close(1013, "Server at capacity — too many WSS connections");
				return;
			}

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

			const subKey = `${serviceName}:${instanceId}`;

			logger.info("WSS client connecting", {
				serviceName,
				instanceId,
				topics: [...topics],
			});

			ws.on("message", async (raw: WebSocket.RawData) => {
				let msg: Record<string, unknown>;
				try {
					msg = JSON.parse(raw.toString());
				} catch {
					ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
					return;
				}
				if (typeof msg.type !== "string") {
					ws.send(
						JSON.stringify({ type: "error", message: "Missing message type" })
					);
					return;
				}

				const incoming: INcomingWssMessage = {
					type: msg.type,
					instanceId: msg.instanceId as string | undefined,
					topics: msg.topics as string[] | undefined,
					payload: msg.payload,
					metadata: msg.metadata,
					traceparent: msg.traceparent as string | undefined,
					messageId: msg.messageId as string | undefined,
				};

				const ctx = { instanceId, serviceName, topics: topics, subKey };

				const Handlers = new Map<string, MessageHandler>([
					["subscribe", this._handleSubscribe.bind(this)],
					["unsubscribe", this._handleUnsubscribe.bind(this)],
					["publish", this._handlePublish.bind(this)],
					["ack", this._handleAck.bind(this)],
					["nack", this._handleNack.bind(this)],
				]);

				const handler = Handlers.get(incoming.type);
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

			ws.on("close", () => {
				this._subscriptions.delete(subKey);
				ws.removeAllListeners();
				logger.info("WSS client disconnected", { serviceName, instanceId });
			});

			ws.on("error", (err) => {
				logger.warn("WSS connection error", {
					error: err.message,
					serviceName,
					instanceId,
				});
				ws.close(1011, "Internal server error");
			});

			this._subscriptions.set(subKey, { instanceId, serviceName, topics, ws });

			ws.send(
				JSON.stringify({
					type: "connected",
					instanceId: ENV.BROKER_INSTANCE_ID,
				})
			);
		});

		logger.info("WSS transport attached at /ws");
	}

	getSubscriber(
		serviceName: string,
		instanceId: string
	): WebSocket | undefined {
		return this._subscriptions.get(`${serviceName}:${instanceId}`)?.ws;
	}

	hasSubscriber(serviceName: string, instanceId: string): boolean {
		return this._subscriptions.has(`${serviceName}:${instanceId}`);
	}

	getConnectedCount(): number {
		return this._subscriptions.size;
	}

	broadcastToTopic(topic: string, message: unknown): number {
		let count = 0;
		const payload = JSON.stringify({ type: "message", topic, message });
		const entries = [...this._subscriptions];
		for (const [key, sub] of entries) {
			if (sub.topics.has(topic) && sub.ws.readyState === WebSocket.OPEN) {
				try {
					sub.ws.send(payload);
					count++;
				} catch {
					this._subscriptions.delete(key);
				}
			}
		}
		return count;
	}

	broadcast(message: unknown): void {
		const payload = JSON.stringify(message);
		const entries = [...this._subscriptions];
		for (const [key, sub] of entries) {
			if (sub.ws.readyState === WebSocket.OPEN) {
				try {
					sub.ws.send(payload);
				} catch {
					this._subscriptions.delete(key);
				}
			}
		}
	}

	async shutdown(): Promise<void> {
		if (this._wss) {
			for (const [, sub] of this._subscriptions) {
				sub.ws.close(1001, "Server shutdown");
			}
			this._subscriptions.clear();
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
		if (this._cleanupTimer) {
			clearInterval(this._cleanupTimer);
			this._cleanupTimer = null;
		}
		this._processedWssDeduplicationIds.clear();
		this._rateLimitWindows.clear();
	}
}
