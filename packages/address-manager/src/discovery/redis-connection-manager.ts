import { logger } from "@trading-model/common/config/logger";
import type { HostPort } from "@trading-model/common/domain/service-identity";
import { normalizeError } from "@trading-model/common/utils/errors";
import Redis, { type RedisOptions } from "ioredis";

export interface RedisConnectionOptions {
	password?: string;
	tls?: Record<string, unknown>;
	sentinels?: HostPort[];
	enableTLSForSentinelMode?: boolean;
}

export class RedisConnectionManager {
	private readonly _redis: Redis;

	constructor(redisUrl: string, options?: RedisConnectionOptions) {
		this._redis = new Redis(redisUrl, this._buildRedisOptions(options));
		this._connect();
	}

	get client(): Redis {
		return this._redis;
	}

	private _buildRedisOptions(options?: RedisConnectionOptions): RedisOptions {
		const baseOptions: RedisOptions = {
			lazyConnect: true,
			retryStrategy: this._buildRetryStrategy(),
			maxRetriesPerRequest: 3,
		};
		return {
			...baseOptions,
			...(options?.password ? { password: options.password } : {}),
			...(options?.tls ? { tls: options.tls } : {}),
			...(options?.sentinels ? this._buildSentinelOptions(options.sentinels) : {}),
		};
	}

	private _buildRetryStrategy(): (times: number) => number | null {
		return (times: number) => {
			if (times > 20) {
				return null;
			}
			return Math.min(times * 200, 5000);
		};
	}

	private _buildSentinelOptions(sentinels: HostPort[]): { sentinels: HostPort[]; name: string } | undefined {
		return { sentinels, name: "mymaster" };
	}

	private _connect(): void {
		this._redis.connect().catch((err) => {
			logger.error("Failed to connect Redis service cache", {
				error: normalizeError(err),
			});
		});
	}

	disconnect(): void {
		try {
			this._redis.disconnect();
		} catch {
			logger.debug("Redis disconnect error (best-effort)");
		}
	}
}
