import Redis from "ioredis";

export class RedisClientManager {
	private _client!: Redis;

	async createClient(url: string): Promise<Redis> {
		const client = new Redis(url, {
			lazyConnect: true,
			retryStrategy: (times) => Math.min(times * 200, 5_000),
		});
		await client.connect();
		this._client = client;
		return client;
	}

	getClient(): Redis {
		return this._client;
	}

	async closeClient(): Promise<void> {
		const client = this._client;
		try {
			if (client.status === "ready") {
				await client.quit();
			} else {
				client.disconnect();
			}
		} catch {
			client.disconnect();
		}
	}

	removeAllListeners(): void {
		this._client.removeAllListeners();
	}
}
