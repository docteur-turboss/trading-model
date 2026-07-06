import { context, propagation } from "@opentelemetry/api";
import type { MessageMetadata } from "@trading-model/common/contracts/message.types";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import { LruCache } from "@trading-model/common/utils/lru-cache";
import type WebSocket from "ws";
import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { getStreamClient } from "../../config/redis";
import { authorizeTopic } from "../core/acl";
import type { Dispatcher } from "../core/dispatcher";
import type { IncomingWssMessage } from "./wss-message.types";
import type { WssRateLimiter } from "./wss-rate-limiter";

export class WssPublisher {
	private _dispatcher: Dispatcher;
	private _rateLimiter: WssRateLimiter;
	private _processedWssDeduplicationIds = new LruCache<true>({ maxSize: 50000, ttlMs: 300_000 });

	constructor(dispatcher: Dispatcher, rateLimiter: WssRateLimiter) {
		this._dispatcher = dispatcher;
		this._rateLimiter = rateLimiter;
	}

	async handlePublish(
		msg: IncomingWssMessage,
		ws: WebSocket,
		ctx: { identity: ServiceIdentity }
	): Promise<void> {
		if (!this._rateLimiter.checkAndReject(ctx.identity.serviceName, ws)) {
			return;
		}
		const topic = (msg.metadata as Record<string, unknown>)?.topic as
			| string
			| undefined;
		if (!(await this._checkPublishTopicAuth(topic, ctx, ws))) {
			return;
		}
		if (!(await this._checkPublishDedup(msg))) {
			return;
		}
		if (!this._checkPublishBackpressure(ws)) {
			return;
		}
		await this._executePublish(msg, ws);
	}

	private async _checkPublishTopicAuth(
		topic: string | undefined,
		ctx: { identity: ServiceIdentity },
		ws: WebSocket
	): Promise<boolean> {
		if (!topic) {
			return true;
		}
		const result = await authorizeTopic(
			{ headers: { "x-service-name": ctx.identity.serviceName } } as never,
			topic
		);
		if (result.allowed) {
			return true;
		}
		ws.send(JSON.stringify({ type: "error", message: result.reason }));
		return false;
	}

	private async _checkPublishDedup(msg: IncomingWssMessage): Promise<boolean> {
		const dedupId = extractDedupId(msg);
		if (!dedupId) {
			return true;
		}
		if (this._processedWssDeduplicationIds.has(dedupId)) {
			return false;
		}
		this._processedWssDeduplicationIds.set(dedupId, true);
		return this._checkRedisDedup(dedupId);
	}

	private async _checkRedisDedup(dedupId: string): Promise<boolean> {
		try {
			const redis = await getStreamClient();
			const key = `${ENV.REDIS_PREFIX}wss-dedup:${dedupId}`;
			return !!(await redis.set(key, "1", "EX", 300, "NX"));
		} catch {
			return true;
		}
	}

	private _checkPublishBackpressure(ws: WebSocket): boolean {
		const bpRatio = this._dispatcher.getBackpressureRatio();
		if (bpRatio <= 0.9) {
			return true;
		}
		ws.send(
			JSON.stringify({
				type: "error",
				message: "Server backpressure too high — try again later",
			})
		);
		return false;
	}

	private async _executePublish(
		msg: IncomingWssMessage,
		ws: WebSocket
	): Promise<void> {
		try {
			const publishPromise = this._buildPublishPromise(msg);
			const messageId = await publishPromise;
			ws.send(JSON.stringify({ type: "published", messageId }));
		} catch (err) {
			logger.warn("WSS publish error", { context: { error: (err as Error).message } });
			ws.send(JSON.stringify({ type: "error", message: "Publish failed" }));
		}
	}

	private _buildPublishPromise(msg: IncomingWssMessage): Promise<string> {
		const traceparent = msg.traceparent as string | undefined;
		const metadata = msg.metadata as Omit<MessageMetadata, "messageId" | "emittedAt">;
		if (traceparent) {
			const carrier = { traceparent };
			const extractedCtx = propagation.extract(context.active(), carrier);
			return context.with(extractedCtx, () =>
				this._dispatcher.publish(msg.payload, metadata)
			);
		}
		return this._dispatcher.publish(msg.payload, metadata);
	}

	clearDedupCache(): void {
		this._processedWssDeduplicationIds.clear();
	}

	shutdown(): void {
		this._processedWssDeduplicationIds.clear();
	}
}

function extractDedupId(msg: IncomingWssMessage): string | undefined {
	const wssMetadata = msg.metadata as Record<string, unknown> | undefined;
	return (
		wssMetadata?.delivery as Record<string, unknown> | undefined
	)?.deduplicationId as string | undefined;
}
