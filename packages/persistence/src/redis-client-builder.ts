import { normalizeError } from "@trading-model/common/utils/errors";
import { getLogger } from "@trading-model/contracts/logger-registry";
import type Redis from "ioredis";
import { RedisStatus } from "./redis-constants";

export class RedisClientBuilder {
	private readonly _client: Redis;

	constructor(client: Redis) {
		this._client = client;
	}

	withErrorHandler(): this {
		this._client.on("error", (err: Error) => {
			getLogger().error("Redis connection error", {
				error: normalizeError(err),
			});
		});
		return this;
	}

	build(): Redis {
		return this._client;
	}

	static async connect(client: Redis): Promise<void> {
		await client.connect();
	}

	static async disconnect(client: Redis): Promise<void> {
		try {
			if (client.status === RedisStatus.READY) {
				await client.quit();
			} else {
				client.disconnect();
			}
		} catch {
			client.disconnect();
		}
	}
}
