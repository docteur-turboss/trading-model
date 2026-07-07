import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import { HTTP_HEADERS } from "@trading-model/common/http-headers";
import type WebSocket from "ws";
import { authorizeTopic } from "../core/acl";
import type { Dispatcher } from "../core/dispatcher";
import type { IncomingWssMessage } from "./wss-message.types";
import type { WssRateLimiter } from "./wss-rate-limiter";
import { WssDedup } from "./wss-dedup";

function extractDedupId(msg: IncomingWssMessage): string | undefined {
	const wssMetadata = msg.metadata as Record<string, unknown> | undefined;
	return (wssMetadata?.delivery as Record<string, unknown> | undefined)
		?.deduplicationId as string | undefined;
}

export class PublishGuard {
	private readonly _dedup = new WssDedup();

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
		return this._dedup.check(dedupId);
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
