/**
 * Instantiates a Broker client with TLS config and exposes its HTTP listener.
 */

import { buildTlsFromEnv } from "@trading-model/common/config/tls-paths";
import { logger } from "@trading-model/http/infrastructure/logger";
import { createRedisClient } from "@trading-model/persistence/redis-connection-manager";
import { redisConnectionFromEnv } from "@trading-model/persistence/redis-env";
import { RedisMessageJournal } from "../adapters/outbound/redis-message-journal";
import { RedisSubscriptionStore } from "../adapters/outbound/redis-subscription-store";
import { ENV } from "../infrastructure/config/env";
import createBrokerModule from "./container";

const SUBSCRIPTION_KEY_PREFIX = "trading-model:message-manager";

const REDIS_CONNECTION = redisConnectionFromEnv(ENV);

/**
 * Holds the subscriptions and the message journal shared by the replicas.
 * Lazy: connects on the first command. Absent without Redis (single replica,
 * everything in memory, lost on restart).
 */
const SUBSCRIPTION_REDIS = REDIS_CONNECTION
	? createRedisClient(REDIS_CONNECTION)
	: undefined;

if (!SUBSCRIPTION_REDIS) {
	logger.warn(
		"Redis not configured — subscriptions and accepted messages kept in memory (single replica only, lost on restart)"
	);
}

/**
 * Broker singleton, instantiated at module load time.
 */
const BROKER = createBrokerModule(
	buildTlsFromEnv(ENV),
	{
		dlqSecret: ENV.DLQ_AUTH_HMAC_SECRET,
	},
	SUBSCRIPTION_REDIS
		? new RedisSubscriptionStore({
				redis: SUBSCRIPTION_REDIS,
				keyPrefix: SUBSCRIPTION_KEY_PREFIX,
			})
		: undefined,
	SUBSCRIPTION_REDIS
		? new RedisMessageJournal({
				redis: SUBSCRIPTION_REDIS,
				openBlockingRedis: () => SUBSCRIPTION_REDIS.duplicate(),
				keyPrefix: SUBSCRIPTION_KEY_PREFIX,
				minReplicas: ENV.JOURNAL_MIN_REPLICAS,
			})
		: undefined
);

/**
 * HTTP route binder to be mounted on an Express app instance.
 */
const MESSAGE_MANAGER_ROUTES = BROKER.listen;

if (!ENV.DLQ_AUTH_HMAC_SECRET) {
	logger.warn(
		"DLQ_AUTH_HMAC_SECRET not set — dead-lettering fails and the entries stay in the journal"
	);
}

/** Starts the workers that deliver the accepted messages (ADR-0048). */
function startDelivery(): void {
	BROKER.startDelivery();
}

/**
 * On shutdown: waits for the deliveries in flight and closes Redis.
 * Messages not delivered yet stay in the journal for the other replicas.
 */
async function closeMessageManager(): Promise<void> {
	await BROKER.stopDelivery();
	SUBSCRIPTION_REDIS?.disconnect();
}

export { closeMessageManager, MESSAGE_MANAGER_ROUTES, startDelivery };
