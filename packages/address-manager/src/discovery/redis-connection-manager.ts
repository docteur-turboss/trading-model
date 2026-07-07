import type { HostPort } from "@trading-model/common/domain/service-identity";
import {
	createRedisConnectionManager,
	type RedisConnectionConfig,
} from "@trading-model/common/persistence/redis-connection-manager";
import { ConnectionManager } from "@trading-model/common/persistence/connection-manager";
import type Redis from "ioredis";
import type { RedisOptions } from "ioredis";

export interface RedisConnectionOptions {
	password?: string;
	tls?: Record<string, unknown>;
	sentinels?: HostPort[];
	enableTLSForSentinelMode?: boolean;
}

export class RedisConnectionManager {
	private readonly _inner: ConnectionManager<Redis>;

	constructor(redisUrl: string, options?: RedisConnectionOptions) {
		const extraOptions: Partial<RedisOptions> = {};

		if (options?.password) {
			extraOptions.password = options.password;
		}
		if (options?.tls) {
			extraOptions.tls = options.tls as RedisOptions["tls"];
		}

		const configOrUrl: string | RedisConnectionConfig = options?.sentinels
			? { mode: "sentinel", config: { sentinels: options.sentinels, name: "mymaster", password: options.password } }
			: redisUrl;

		this._inner = createRedisConnectionManager(
			configOrUrl,
			Object.keys(extraOptions).length > 0 ? extraOptions : undefined,
		) as unknown as ConnectionManager<Redis>;
	}

	async getConnection(): Promise<Redis> {
		return this._inner.getConnection() as Promise<Redis>;
	}

	getClient(): Redis {
		const client = this._inner.getClient();
		if (!client) throw new Error("Redis not connected");
		return client as Redis;
	}

	async close(): Promise<void> {
		return this._inner.close();
	}

	disconnect(): void {
		this.close().catch(() => {});
	}
}
