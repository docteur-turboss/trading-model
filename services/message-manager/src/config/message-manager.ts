/**
 * Instantiates a Broker client with TLS config and exposes its HTTP listener.
 */

import { DeadStreams } from "@trading-model/broker-message/bus/dead-streams";
import {
	JOURNAL_WRITE_COMMAND_TIMEOUT_MS,
	RedisMessageJournal,
} from "@trading-model/broker-message/bus/redis-journal";
import { buildTlsFromEnv } from "@trading-model/common/config/tls-paths";
import { logger } from "@trading-model/http/logger";
import { createRedisClient } from "@trading-model/persistence/redis-connection-manager";
import { redisConnectionFromEnv } from "@trading-model/persistence/redis-env";
import { RedisDeadLetterStore } from "../adapters/outbound/redis-dead-letter-store";
import { RedisSubscriptionStore } from "../adapters/outbound/redis-subscription-store";
import { ENV } from "../infrastructure/config/env";
import createBrokerModule from "./container";
import { auditDeadLetter, publishDeadLetterCounts } from "./dead-letters";

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

const JOURNAL = SUBSCRIPTION_REDIS
	? new RedisMessageJournal({
			redis: SUBSCRIPTION_REDIS,
			openBlockingRedis: () => SUBSCRIPTION_REDIS.duplicate(),
			openWriteRedis: () =>
				SUBSCRIPTION_REDIS.duplicate({
					commandTimeout: JOURNAL_WRITE_COMMAND_TIMEOUT_MS,
				}),
			keyPrefix: SUBSCRIPTION_KEY_PREFIX,
			minReplicas: ENV.JOURNAL_MIN_REPLICAS,
		})
	: undefined;

const DEAD_STREAMS = JOURNAL ? new DeadStreams(JOURNAL) : undefined;

const DEAD_LETTER_STORE = DEAD_STREAMS
	? new RedisDeadLetterStore(DEAD_STREAMS, (input, id) =>
			auditDeadLetter(JOURNAL as RedisMessageJournal, input, id)
		)
	: undefined;

/**
 * Broker singleton, instantiated at module load time.
 */
const BROKER = createBrokerModule(
	buildTlsFromEnv(ENV),
	DEAD_LETTER_STORE,
	SUBSCRIPTION_REDIS
		? new RedisSubscriptionStore({
				redis: SUBSCRIPTION_REDIS,
				keyPrefix: SUBSCRIPTION_KEY_PREFIX,
			})
		: undefined,
	JOURNAL
);

/**
 * HTTP route binder to be mounted on an Express app instance.
 */
const MESSAGE_MANAGER_ROUTES = BROKER.listen;

let deadLetterTimer: NodeJS.Timeout | undefined;

/** Starts the workers that deliver the accepted messages (ADR-0048). */
function startDelivery(): void {
	BROKER.startDelivery();
	if (JOURNAL && DEAD_STREAMS) {
		const measure = () =>
			publishDeadLetterCounts(JOURNAL, DEAD_STREAMS).catch((err: unknown) =>
				logger.error("Reading the dead streams failed", { error: err })
			);
		void measure();
		deadLetterTimer = setInterval(() => void measure(), 15_000);
		deadLetterTimer.unref();
	}
}

/**
 * On shutdown: waits for the deliveries in flight and closes Redis.
 * Messages not delivered yet stay in the journal for the other replicas.
 */
async function closeMessageManager(): Promise<void> {
	clearInterval(deadLetterTimer);
	await BROKER.stopDelivery();
	SUBSCRIPTION_REDIS?.disconnect();
}

export { closeMessageManager, MESSAGE_MANAGER_ROUTES, startDelivery };
