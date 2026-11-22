import type addressManagerClient from "@trading-model/address-manager";
import { parseServiceName } from "@trading-model/common/config/services.types";
import {
	buildTlsFromEnv,
	type TlsEnvVars,
	type TlsPaths,
} from "@trading-model/common/config/tls-paths";
import { createRedisClient } from "@trading-model/persistence/redis-connection-manager";
import {
	type RedisEnv,
	redisConnectionFromEnv,
} from "@trading-model/persistence/redis-env";
import { toInstanceId } from "@trading-model/primitives/primitives";
import MessageManagerClass from "./broker-message";
import { openJournalWriter, RedisMessageJournal } from "./bus/redis-journal";
import type { MessageManagerConfig } from "./types/config";

/** Configuration options for creating a MessageManager instance. */
export interface MessageManagerOptions extends MessageManagerConfig {
	addressManagerClient: addressManagerClient;
	tlsPaths: TlsPaths;
	/** The bus in Redis (ADR-0073, `busJournalFromEnv`); absent: HTTP through message-manager. */
	journal?: RedisMessageJournal;
}

/** Creates a MessageManager instance.
 *
 * @param options - Configuration options
 * @returns An object containing the MessageManager instance
 */
export function createMessageManager(options: MessageManagerOptions) {
	const ma = new MessageManagerClass(options);
	return {
		messageManager: ma,
	};
}

/** Key prefix of the bus streams, kept from message-manager (ADR-0073: a rename would lose entries). */
export const BUS_KEY_PREFIX = "trading-model:message-manager";

interface ServiceEnv extends TlsEnvVars, RedisEnv {
	INSTANCE_ID: string;
	SERVICE_NAME: string;
	MESSAGE_CALLBACK_PATH: string;
}

/**
 * The bus of a service (ADR-0073), chosen by `BUS_TRANSPORT`: `library` gives the
 * journal in the shared Redis, `http` gives `undefined` (message-manager over HTTP).
 * Unset (N-1): the journal when Redis settings exist, `undefined` otherwise.
 * @throws {Error} `library` without Redis settings
 */
export function busJournalFromEnv(
	env: RedisEnv & {
		JOURNAL_MIN_REPLICAS?: number;
		BUS_TRANSPORT?: "library" | "http";
	}
): RedisMessageJournal | undefined {
	if (env.BUS_TRANSPORT === "http") {
		return undefined;
	}
	const connection = redisConnectionFromEnv(env);
	if (!connection) {
		if (env.BUS_TRANSPORT === "library") {
			throw new Error(
				"BUS_TRANSPORT=library needs REDIS_URL or REDIS_SENTINELS"
			);
		}
		return undefined;
	}
	const redis = createRedisClient(connection);
	return new RedisMessageJournal({
		redis: redis as never,
		openBlockingRedis: () => redis.duplicate() as never,
		openWriteRedis: () => openJournalWriter(redis as never),
		keyPrefix: BUS_KEY_PREFIX,
		minReplicas: env.JOURNAL_MIN_REPLICAS,
	});
}

/**
 * Convenience factory that extracts TLS paths and identity from a service env
 * object, eliminating the need for each service to manually pluck the same
 * fields. Pass the service's env object (which must contain TLS_CERT_PATH,
 * TLS_KEY_PATH, TLS_CA_PATH, INSTANCE_ID, SERVICE_NAME, MESSAGE_CALLBACK_PATH).
 */
export function createServiceMessageManager(
	addressManagerClient: addressManagerClient,
	env: ServiceEnv
) {
	return createMessageManager({
		journal: busJournalFromEnv(env),
		addressManagerClient,
		tlsPaths: buildTlsFromEnv(env),
		instanceId: toInstanceId(env.INSTANCE_ID),
		serviceName: parseServiceName(env.SERVICE_NAME),
		callbackPath: env.MESSAGE_CALLBACK_PATH,
	});
}
