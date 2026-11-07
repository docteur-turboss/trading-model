/**
 * Instantiates a Broker client with TLS config and exposes its HTTP listener.
 */

import { buildTlsFromEnv } from "@trading-model/common/config/tls-paths";
import { normalizeError } from "@trading-model/common/utils/errors";
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
		filePath: ENV.DLQ_LOCAL_FALLBACK_PATH,
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
		"DLQ_AUTH_HMAC_SECRET not set — dead letters stay in DLQ_LOCAL_FALLBACK_PATH, not in dlq-service"
	);
}

let forwardTimer: NodeJS.Timeout | undefined;

function forwardDeadLetters(): Promise<void> {
	return BROKER.forwardDeadLetters().catch((err: unknown) => {
		logger.error("Forwarding the local dead letters failed", {
			error: normalizeError(err),
		});
	});
}

/**
 * Sends the dead letters kept in the local file to dlq-service, now (left
 * by a previous run) and every DLQ_FORWARD_INTERVAL_MS.
 */
function startDeadLetterForwarding(): void {
	void forwardDeadLetters();
	forwardTimer = setInterval(
		() => void forwardDeadLetters(),
		ENV.DLQ_FORWARD_INTERVAL_MS
	);
	forwardTimer.unref();
}

/** Starts the workers that deliver the accepted messages (ADR-0048). */
function startDelivery(): void {
	BROKER.startDelivery();
}

/**
 * On shutdown: waits for the deliveries in flight, closes Redis and sends the
 * dead letters still in the local file, whose volume does not outlive the
 * pod. Messages not delivered yet stay in the journal for the other replicas.
 */
async function closeMessageManager(): Promise<void> {
	clearInterval(forwardTimer);
	await BROKER.stopDelivery();
	SUBSCRIPTION_REDIS?.disconnect();
	await forwardDeadLetters();
}

export {
	closeMessageManager,
	MESSAGE_MANAGER_ROUTES,
	startDeadLetterForwarding,
	startDelivery,
};
