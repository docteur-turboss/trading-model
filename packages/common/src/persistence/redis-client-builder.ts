import type Redis from "ioredis";
import type { Cluster } from "ioredis";
import { logger } from "../config/logger";
import { normalizeError } from "../utils/errors";
import { RedisStatus } from "./redis-constants";

export class RedisClientBuilder {
	private readonly _client: Redis | Cluster;

	constructor(client: Redis | Cluster) {
		this._client = client;
	}

	withErrorHandler(): this {
		this._client.on("error", (err: Error) => {
			logger.error("Redis connection error", {
				error: normalizeError(err),
			});
		});
		return this;
	}

	build(): Redis | Cluster {
		return this._client;
	}

	static async connect(client: Redis | Cluster): Promise<void> {
		await client.connect();
	}

	static async disconnect(client: Redis | Cluster): Promise<void> {
		try {
			if ((client as Redis).status === RedisStatus.READY) {
				await (client as Redis).quit();
			} else {
				client.disconnect();
			}
		} catch {
			client.disconnect();
		}
	}
}
