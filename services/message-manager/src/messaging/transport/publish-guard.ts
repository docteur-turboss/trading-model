import type { Topic } from "@trading-model/common/domain/primitives";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import { HTTP_HEADERS } from "@trading-model/common/http-headers";
import type WebSocket from "ws";
import { ENV } from "../../config/env";
import { RedisKeyBuilder } from "../../infrastructure/redis/redis-key-builder";
import { authorizeTopic } from "../core/acl";
import { DeduplicationService } from "../core/deduplication-service";
import type { Dispatcher } from "../core/dispatcher";
import type { WsTransportMessage } from "./wss-message.types";
import type { WssRateLimiter } from "./wss-rate-limiter";

function extractDedupId(msg: WsTransportMessage): string | undefined {
	const wssMetadata = msg.metadata as Record<string, unknown> | undefined;
	return (wssMetadata?.delivery as Record<string, unknown> | undefined)
		?.deduplicationId as string | undefined;
}

export class PublishGuard {
	private readonly _dedup: DeduplicationService;

	constructor(
		private readonly _dispatcher: Dispatcher,
		readonly _rateLimiter: WssRateLimiter
	) {
		this._dedup = new DeduplicationService(
			new RedisKeyBuilder(`${ENV.REDIS_PREFIX}wss-`)
		);
	}

	async checkTopicAuth(
		topic: Topic | undefined,
		ctx: { identity: ServiceIdentity },
		ws: WebSocket
	): Promise<boolean> {
		if (!topic) {
			return true;
		}
		const result = await authorizeTopic(
			{
				headers: { [HTTP_HEADERS.X_SERVICE_NAME]: ctx.identity.serviceName },
			} as never,
			topic
		);
		if (result.allowed) {
			return true;
		}
		ws.send(JSON.stringify({ type: "error", message: result.reason }));
		return false;
	}

	checkDedup(msg: WsTransportMessage): Promise<boolean> {
		const dedupId = extractDedupId(msg);
		if (!dedupId) {
			return Promise.resolve(true);
		}
		return this._dedup.tryDeduplicate({ deduplicationId: dedupId, ttlS: 300 });
	}

	checkBackpressure(ws: WebSocket): boolean {
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

	clearDedupCache(): void {
		this._dedup.clear();
	}

	shutdown(): void {
		this._dedup.clear();
	}
}
