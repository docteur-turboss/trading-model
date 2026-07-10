import type { URLString } from "@trading-model/common/domain/primitives";
import { REDIS_STATUS } from "@trading-model/common/persistence/redis-constants";
import Redis from "ioredis";

export class RedisClientManager {
	private _client: Redis | null = null;

	async createClient(url: URLString): Promise<Redis> {
		const client = new Redis(url, {
			lazyConnect: true,
			retryStrategy: (times) => Math.min(times * 200, 5_000),
		});
		await client.connect();
		this._client = client;
		return client;
	}

	getClient(): Redis | null {
		return this._client;
	}

	async closeClient(): Promise<void> {
		const client = this._client;
		if (!client) {
			return;
		}
		try {
			if (client.status === REDIS_STATUS.READY) {
				await client.quit();
			} else {
				client.disconnect();
			}
		} catch {
			client.disconnect();
		}
	}

	removeAllListeners(): void {
		this._client?.removeAllListeners();
	}
}
