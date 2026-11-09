import { Limit, toInstanceId } from "@trading-model/primitives/primitives";
import {
	createDlqHandlers,
	type DlqHandlers,
} from "../adapters/inbound/dlq-service";
import {
	notifyAddAudit,
	notifyDeleteAudit,
	notifyReplayAudit,
} from "../adapters/outbound/audit-notifier";
import { DlqClaimManager } from "../adapters/outbound/claim-manager";
import { ClaimReleaseManager } from "../adapters/outbound/claim-release-manager";
import {
	type DeliveryBookkeeping,
	deliverEntry,
} from "../adapters/outbound/delivery-executor";
import { pushToRedisQueue } from "../adapters/outbound/dlq-redis-pusher";
import {
	closeHttpClient,
	getHttpClient,
} from "../adapters/outbound/http-client-manager";
import { resolveMessageManagerUrl } from "../adapters/outbound/message-manager-resolver";
import { QueuePopService } from "../adapters/outbound/redis-queue-pop-service";
import { DlqRepository } from "../adapters/outbound/repository";
import { DlqRetryManager } from "../adapters/outbound/retry-manager";
import { createAutoRetryCycle } from "../application/services/auto-retry-cycle";
import { createQueueRebuilder } from "../application/services/auto-retry-queue";
import { ClaimReleaseService } from "../application/services/claim-release-service";
import { ClaimReplayOrchestrator } from "../application/services/redis-claim-replay-orchestrator";
import { createReplayBatch } from "../application/services/replay-batch";
import { ReplayDrainService } from "../application/services/replay-drain-service";
import { createAddEntry } from "../application/use-cases/add-entry-pipeline";
import { createDeleteEntries } from "../application/use-cases/dlq-delete-handler";
import { createReplayEntries } from "../application/use-cases/dlq-replay-service";
import { createRedisQueueProcessor } from "../application/use-cases/redis-queue-processor";
import type { DlqAuditPort, DlqMetricsPort } from "../domain/ports/dlq.ports";
import type {
	DlqReplaySettings,
	EntryDeliveryPort,
} from "../domain/ports/replay.ports";
import { createAutoRetryScheduler } from "../infrastructure/auto-retry-scheduler";
import type { Env } from "../infrastructure/config/env";
import { DlqPruner } from "../infrastructure/dlq-pruner";
import { ensureRedisQueue } from "../infrastructure/redis-init";
import { RedisWorkerTimer } from "../infrastructure/redis-worker-timer";
import { emitReplayMetrics } from "../shared/replay-metrics";
import { setShuttingDown } from "../shared/shutdown-flag";
import { metrics } from "./metrics";
import { MongoConnectionManager } from "./mongo-connection-manager";
import { dlqRedisQueue } from "./redis-queue";

/** The wired service: HTTP handlers plus the lifecycle the entry point drives. */
export interface DlqApp {
	handlers: DlqHandlers;
	/** Connects MongoDB (builds the indexes). */
	connectDb(): Promise<void>;
	/** Frees the claims left by a previous instance. */
	releaseStaleClaims(staleThresholdMs?: number): Promise<void>;
	/** Forgets the Mongo connection after a failed start, so the next call retries. */
	resetDb(): Promise<void>;
	closeDb(): Promise<void>;
	/** The scheduled jobs, callable on their own (the schedulers drive them). */
	jobs: {
		autoRetryTick(): Promise<void>;
		rebuildQueueFromMongo(): Promise<void>;
		processRedisQueue(): Promise<void>;
	};
	/** Starts the Redis queue, the periodic prune and, when enabled, the auto-retry. */
	start(): void;
	/** Stops the timers, drains the replays in flight, releases the claims. */
	shutdownSchedulers(): Promise<void>;
}

const metricsPort: DlqMetricsPort = {
	entryAdded: () => metrics.entriesAdded.inc(1),
	entriesDeleted: (count) => metrics.entriesDeleted.inc(count),
	batchReplayed: emitReplayMetrics,
};

const auditPort: DlqAuditPort = {
	notifyAdd: notifyAddAudit,
	notifyDelete: notifyDeleteAudit,
	notifyReplay: notifyReplayAudit,
};

/** Delivers over the shared mTLS HTTP client. */
function _httpEntryDelivery(
	bookkeeping: DeliveryBookkeeping
): EntryDeliveryPort {
	return {
		async deliver(entry, target) {
			await deliverEntry(entry, {
				...target,
				...bookkeeping,
				client: await getHttpClient(),
			});
		},
	};
}

/**
 * Builds every dependency of dlq-service from its environment. Nothing is
 * built at import time: the entry point calls this once.
 */
export function createDlqApp(env: Env): DlqApp {
	const mongo = new MongoConnectionManager(env);
	const getCollection = () => mongo.getCollection();

	const repository = new DlqRepository(getCollection);
	const claims = new DlqClaimManager(getCollection);
	const claimRelease = new ClaimReleaseManager(getCollection);
	const retryManager = new DlqRetryManager(getCollection);
	const queuePop = new QueuePopService();
	const messageManager = { resolve: resolveMessageManagerUrl };

	// Getters: env is read on every access, so a change after wiring applies.
	const settings: DlqReplaySettings = {
		get instanceId() {
			return toInstanceId(env.INSTANCE_ID);
		},
		get autoRetryEnabled() {
			return env.DLQ_AUTO_RETRY_ENABLED;
		},
		get autoRetryLimit() {
			return Limit.of(env.DLQ_AUTO_RETRY_LIMIT, 100);
		},
	};

	const replayBatch = createReplayBatch(
		_httpEntryDelivery({ retryManager, claimRelease })
	);
	const autoRetryCycle = createAutoRetryCycle({
		claims,
		claimRelease,
		retryLedger: retryManager,
		messageManager,
		audit: auditPort,
		replayBatch,
		settings,
	});
	const rebuildQueueFromMongo = createQueueRebuilder({
		entries: repository,
		queue: dlqRedisQueue,
	});
	const claimReplayOrchestrator = new ClaimReplayOrchestrator({
		claims,
		queue: dlqRedisQueue,
		replayBatch,
		handleAbandonedEntries: autoRetryCycle.handleAbandonedEntries,
		settings,
	});
	const claimReleaseService = new ClaimReleaseService({
		claimRelease,
		entries: repository,
		queue: dlqRedisQueue,
		settings,
	});
	const replayDrainService = new ReplayDrainService();

	const processRedisQueue = createRedisQueueProcessor({
		queue: queuePop,
		messageManager,
		claimRelease,
		orchestrator: claimReplayOrchestrator,
	});
	const redisWorkerTimer = new RedisWorkerTimer(processRedisQueue);
	const autoRetry = createAutoRetryScheduler({
		env,
		tick: autoRetryCycle.tick,
		redisWorker: {
			start: () => redisWorkerTimer.start(),
			stop: () => redisWorkerTimer.stop(),
		},
	});
	const pruner = new DlqPruner(repository, env);

	const handlers = createDlqHandlers({
		entries: repository,
		db: {
			isConnected: () => mongo.isConnected(),
			getMissingCriticalIndexes: () => mongo.getMissingCriticalIndexes(),
		},
		queue: dlqRedisQueue,
		useCases: {
			addEntry: createAddEntry({
				entries: repository,
				storage: { isAvailable: () => mongo.isConnected() },
				queue: { enqueue: pushToRedisQueue },
				metrics: metricsPort,
				audit: auditPort,
			}),
			deleteEntries: createDeleteEntries({
				entries: repository,
				metrics: metricsPort,
				audit: auditPort,
			}),
			replayEntries: createReplayEntries({
				messageManager,
				claimRelease,
				claims,
				retryLedger: retryManager,
				replayBatch,
				audit: auditPort,
				metrics: metricsPort,
				settings,
			}),
		},
	});

	return {
		handlers,
		async connectDb() {
			await mongo.getDb();
		},
		releaseStaleClaims: (staleThresholdMs) =>
			claimReleaseService.releaseStale(staleThresholdMs),
		jobs: {
			autoRetryTick: autoRetryCycle.tick,
			rebuildQueueFromMongo,
			processRedisQueue,
		},
		resetDb: () => mongo.resetState(),
		closeDb: () => mongo.close(),
		start() {
			void ensureRedisQueue(dlqRedisQueue, rebuildQueueFromMongo);
			pruner.start();
			autoRetry.start();
		},
		async shutdownSchedulers() {
			setShuttingDown(true);
			pruner.stop();
			autoRetry.stop();
			// Releasing the claims of a replay still in flight would publish it twice.
			if (await replayDrainService.drain()) {
				await claimReleaseService.releaseAndRequeue();
			}
			await dlqRedisQueue.close();
			await closeHttpClient();
		},
	};
}
