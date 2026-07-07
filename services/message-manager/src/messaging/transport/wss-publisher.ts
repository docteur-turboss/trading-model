import { context, propagation } from "@opentelemetry/api";
import type { MessageMetadata } from "@trading-model/common/contracts/message.types";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type WebSocket from "ws";
import { logger } from "../../config/logger";
import type { Dispatcher } from "../core/dispatcher";
import { PublishGuard } from "./publish-guard";
import type { IncomingWssMessage } from "./wss-message.types";
import type { WssRateLimiter } from "./wss-rate-limiter";

export class WssPublisher {
	private _dispatcher: Dispatcher;
	private _rateLimiter: WssRateLimiter;
	private _guard: PublishGuard;

	constructor(dispatcher: Dispatcher, rateLimiter: WssRateLimiter) {
		this._dispatcher = dispatcher;
		this._rateLimiter = rateLimiter;
		this._guard = new PublishGuard(dispatcher, rateLimiter);
	}

	async handlePublish(
		msg: IncomingWssMessage,
		ws: WebSocket,
		ctx: { identity: ServiceIdentity }
	): Promise<void> {
		if (!(await this._checkPublishGuards(msg, ws, ctx))) {
			return;
		}
		await this._executePublish(msg, ws);
	}

	private async _checkPublishGuards(
		msg: IncomingWssMessage,
		ws: WebSocket,
		ctx: { identity: ServiceIdentity }
	): Promise<boolean> {
		if (!this._rateLimiter.checkAndReject(ctx.identity.serviceName, ws)) {
			return false;
		}
		const topic = (msg.metadata as Record<string, unknown>)?.topic as
			| string
			| undefined;
		if (!(await this._guard.checkTopicAuth(topic, ctx, ws))) {
			return false;
		}
		if (!(await this._guard.checkDedup(msg))) {
			return false;
		}
		if (!this._guard.checkBackpressure(ws)) {
			return false;
		}
		return true;
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
			logger.warn("WSS publish error", {
				context: { error: (err as Error).message },
			});
			ws.send(JSON.stringify({ type: "error", message: "Publish failed" }));
		}
	}

	private _buildPublishPromise(msg: IncomingWssMessage): Promise<string> {
		const traceparent = msg.traceparent as string | undefined;
		const metadata = msg.metadata as Omit<
			MessageMetadata,
			"messageId" | "emittedAt"
		>;
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
		this._guard.clearDedupCache();
	}

	shutdown(): void {
		this._guard.shutdown();
	}
}
