import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import { HTTP_HEADERS } from "@trading-model/common/http-headers";
import { LruCache } from "@trading-model/common/utils/lru-cache";
import type WebSocket from "ws";
import { ENV } from "../../config/env";
import { getStreamClient } from "../../config/redis";
import { authorizeTopic } from "../core/acl";
import type { Dispatcher } from "../core/dispatcher";
import type { IncomingWssMessage } from "./wss-message.types";
import type { WssRateLimiter } from "./wss-rate-limiter";

function extractDedupId(msg: IncomingWssMessage): string | undefined {
	const wssMetadata = msg.metadata as Record<string, unknown> | undefined;
	return (wssMetadata?.delivery as Record<string, unknown> | undefined)
		?.deduplicationId as string | undefined;
}

export class PublishGuard {
	private _processedWssDeduplicationIds = new LruCache<true>({
		maxSize: 50000,
		ttlMs: 300_000,
	});

	constructor(
		private readonly _dispatcher: Dispatcher,
		readonly _rateLimiter: WssRateLimiter
	) {}

	async checkTopicAuth(
		topic: string | undefined,
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

	async checkDedup(msg: IncomingWssMessage): Promise<boolean> {
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
			return Boolean(await redis.set(key, "1", "EX", 300, "NX"));
		} catch {
			return true;
		}
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
		this._processedWssDeduplicationIds.clear();
	}

	shutdown(): void {
		this._processedWssDeduplicationIds.clear();
	}
}
