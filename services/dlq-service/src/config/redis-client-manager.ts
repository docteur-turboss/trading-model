import Redis from "ioredis";

import { logger } from "./logger";

export class RedisClientManager {
	private _client: Redis | null = null;

	async createClient(url: string): Promise<Redis> {
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
			if (client.status === "ready") {
				await client.quit();
			} else {
				client.disconnect();
			}
		} catch {
			client.disconnect();
		}
		this._client = null;
	}

	removeAllListeners(): void {
		this._client?.removeAllListeners();
	}
}
