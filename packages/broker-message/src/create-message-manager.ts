import { parseServiceName } from "@trading-model/common/config/services.types";
import { createRedisClient } from "@trading-model/persistence/redis-connection-manager";
import {
	type RedisEnv,
	redisConnectionFromEnv,
} from "@trading-model/persistence/redis-env";
import { InstanceId } from "@trading-model/primitives/primitives";
import BusClient from "./broker-message";
import { openJournalWriter, RedisMessageJournal } from "./bus/redis-journal";

/** Key prefix of the bus streams, kept from message-manager (ADR-0073: a rename would lose entries). */
export const BUS_KEY_PREFIX = "trading-model:message-manager";

interface ServiceEnv extends RedisEnv {
	INSTANCE_ID: string;
	SERVICE_NAME: string;
	JOURNAL_MIN_REPLICAS?: number;
}

/**
 * The bus of a service (ADR-0073): the journal in the shared Redis.
 *
 * @throws when the env carries no Redis settings: the bus has no other transport.
 */
export function busJournalFromEnv(
	env: RedisEnv & { JOURNAL_MIN_REPLICAS?: number }
): RedisMessageJournal {
	const connection = redisConnectionFromEnv(env);
	if (!connection) {
		throw new Error("REDIS_URL or REDIS_SENTINELS is required by the bus");
	}
	const redis = createRedisClient(connection);
	return new RedisMessageJournal({
		redis,
		openBlockingRedis: () => redis.duplicate(),
		openWriteRedis: () => openJournalWriter(redis),
		keyPrefix: BUS_KEY_PREFIX,
		minReplicas: env.JOURNAL_MIN_REPLICAS,
	});
}

/** The bus client of a service, built from its env object. */
export function createServiceBusClient(env: ServiceEnv): BusClient {
	return new BusClient({
		journal: busJournalFromEnv(env),
		instanceId: InstanceId.of(env.INSTANCE_ID),
		serviceName: parseServiceName(env.SERVICE_NAME),
	});
}
