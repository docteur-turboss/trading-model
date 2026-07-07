import { TimerHandle } from "@trading-model/common/utils/timer-handle";
import { ENV } from "../../config/env";

export class ArchiveTopicsCache {
	private _topicsCache: string[] = [];
	private readonly _topicsCacheTimer = new TimerHandle();

	startRefresh(): void {
		this._topicsCacheTimer.startInterval(async () => {
			try {
				const { getSubscriptionClient } = await import("../../config/redis.js");
				const redis = await getSubscriptionClient();
				const topics = await redis.smembers(`${ENV.REDIS_PREFIX}topics`);
				this._topicsCache = topics;
			} catch {
				// topic cache refresh best-effort
			}
		}, 30_000);
		this._topicsCacheTimer.unref();
	}

	stopRefresh(): void {
		this._topicsCacheTimer.stop();
	}

	getTopics(): string[] {
		return this._topicsCache;
	}
}
