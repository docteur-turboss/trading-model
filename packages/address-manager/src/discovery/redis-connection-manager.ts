import { logger } from "@trading-model/common/config/logger";
import type { HostPort } from "@trading-model/common/domain/service-identity";
import { ConnectionManager } from "@trading-model/common/persistence/connection-manager";
import { normalizeError } from "@trading-model/common/utils/errors";
import Redis, { type RedisOptions } from "ioredis";

export interface RedisConnectionOptions {
	password?: string;
	tls?: Record<string, unknown>;
	sentinels?: HostPort[];
	enableTLSForSentinelMode?: boolean;
}

const RETRY_STRATEGY = (times: number): number | null => {
	if (times > 20) return null;
	return Math.min(times * 200, 5000);
};

function buildRedisOptions(options?: RedisConnectionOptions): RedisOptions {
	const baseOptions: RedisOptions = {
		lazyConnect: true,
		retryStrategy: RETRY_STRATEGY,
		maxRetriesPerRequest: 3,
	};
	return {
		...baseOptions,
		...(options?.password ? { password: options.password } : {}),
		...(options?.tls ? { tls: options.tls } : {}),
		...(options?.sentinels ? { sentinels: options.sentinels, name: "mymaster" } : {}),
	};
}

export class RedisConnectionManager extends ConnectionManager<Redis> {
	constructor(redisUrl: string, options?: RedisConnectionOptions) {
		const redisOptions = buildRedisOptions(options);
		super(
			async () => {
				const client = new Redis(redisUrl, redisOptions);
				await client.connect();
				return client;
			},
			async (client: Redis) => {
				try {
					if (client.status === "ready") {
						await client.quit();
					} else {
						client.disconnect();
					}
				} catch {
					client.disconnect();
				}
			},
			{ maxRetries: 5, baseDelayMs: 1000, maxDelayMs: 30000 },
		);
	}

	get client(): Redis {
		if (!this._connection) throw new Error("Redis not connected");
		return this._connection;
	}

	disconnect(): void {
		this.close().catch(() => {});
	}
}
