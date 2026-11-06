import { normalizeError } from "@trading-model/common/utils/errors";
import { getLogger } from "@trading-model/contracts/logger-registry";
import type Redis from "ioredis";
import { RedisStatus } from "./redis-constants";

export function withErrorLogging(client: Redis): Redis {
	client.on("error", (err: Error) => {
		getLogger().error("Redis connection error", {
			error: normalizeError(err),
		});
	});
	return client;
}

export async function disconnectRedis(client: Redis): Promise<void> {
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
