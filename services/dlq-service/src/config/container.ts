import { Limit, toInstanceId } from "@trading-model/primitives/primitives";
import { notifyReplayAudit } from "../adapters/outbound/audit-notifier";
import {
	claimReleaseManager,
	dlqClaimManager,
} from "../adapters/outbound/claim-manager";
import { deliverEntry } from "../adapters/outbound/delivery-executor";
import { getHttpClient } from "../adapters/outbound/http-client-manager";
import { resolveMessageManagerUrl } from "../adapters/outbound/message-manager-resolver";
import { dlqRepository } from "../adapters/outbound/repository";
import { dlqRetryManager } from "../adapters/outbound/retry-manager";
import { createAutoRetryCycle } from "../application/services/auto-retry-cycle";
import { createQueueRebuilder } from "../application/services/auto-retry-queue";
import { ClaimReleaseService } from "../application/services/claim-release-service";
import { ClaimReplayOrchestrator } from "../application/services/redis-claim-replay-orchestrator";
import { createReplayBatch } from "../application/services/replay-batch";
import { ReplayDrainService } from "../application/services/replay-drain-service";
import type {
	DlqReplaySettings,
	EntryDeliveryPort,
} from "../domain/ports/replay.ports";
import { ENV } from "../infrastructure/config/env";
import { dlqRedisQueue } from "./redis-queue";

/** Read on every access: tests and hot reloads may change ENV after wiring. */
const settings: DlqReplaySettings = {
	get instanceId() {
		return toInstanceId(ENV.INSTANCE_ID);
	},
	get autoRetryEnabled() {
		return ENV.DLQ_AUTO_RETRY_ENABLED;
	},
	get autoRetryLimit() {
		return Limit.of(ENV.DLQ_AUTO_RETRY_LIMIT, 100);
	},
};

/** Delivers over the shared mTLS HTTP client. */
const httpEntryDelivery: EntryDeliveryPort = {
	async deliver(entry, target) {
		await deliverEntry(entry, { ...target, client: await getHttpClient() });
	},
};

export const doReplayBatch = createReplayBatch(httpEntryDelivery);

const autoRetryCycle = createAutoRetryCycle({
	claims: dlqClaimManager,
	claimRelease: claimReleaseManager,
	retryLedger: dlqRetryManager,
	messageManager: { resolve: resolveMessageManagerUrl },
	audit: { notifyReplay: notifyReplayAudit },
	replayBatch: doReplayBatch,
	settings,
});

export const autoRetryTick = (): Promise<void> => autoRetryCycle.tick();

export const handleAbandonedEntries = (source: string): Promise<void> =>
	autoRetryCycle.handleAbandonedEntries(source);

export const rebuildQueueFromMongo = createQueueRebuilder({
	entries: dlqRepository,
	queue: dlqRedisQueue,
});

export const claimReplayOrchestrator = new ClaimReplayOrchestrator({
	claims: dlqClaimManager,
	queue: dlqRedisQueue,
	replayBatch: doReplayBatch,
	handleAbandonedEntries,
	settings,
});

export const claimReleaseService = new ClaimReleaseService({
	claimRelease: claimReleaseManager,
	entries: dlqRepository,
	queue: dlqRedisQueue,
	settings,
});

export const replayDrainService = new ReplayDrainService(claimReleaseManager);
