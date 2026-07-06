import { ENV } from "../../config/env";

export class ArchiveTopicsCache {
	private _topicsCache: string[] = [];
	private _topicsCacheTimer: ReturnType<typeof setInterval> | null = null;

	startRefresh(): void {
		this._topicsCacheTimer = setInterval(async () => {
			try {
				const { getSubscriptionClient } = await import("../../config/redis.js");
				const redis = await getSubscriptionClient();
				const topics = await redis.smembers(`${ENV.REDIS_PREFIX}topics`);
				this._topicsCache = topics;
			} catch {
				// best-effort
			}
		}, 30_000);
		this._topicsCacheTimer.unref();
	}

	stopRefresh(): void {
		if (this._topicsCacheTimer) {
			clearInterval(this._topicsCacheTimer);
			this._topicsCacheTimer = null;
		}
	}

	getTopics(): string[] {
		return this._topicsCache;
	}
}
