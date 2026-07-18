import type { Redis } from "ioredis";
import type { ServiceRegistryKeyBuilder } from "./redis-key-builder";

export interface RedisDeps {
	redis: Redis;
	keyBuilder: ServiceRegistryKeyBuilder;
	signingSecret: string;
}

export interface RedisDepsWithoutToken {
	redis: Redis;
	keyBuilder: ServiceRegistryKeyBuilder;
}
