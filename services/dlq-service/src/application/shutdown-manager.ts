import { dlqRedisQueue } from "../config/redis-queue";
import { closeHttpClient } from "../dlq/shared/http-client-manager";
import { setShuttingDown } from "../dlq/shared/shutdown-flag";
import { stopAutoRetry } from "../infrastructure/auto-retry-scheduler";
import { DlqPruner } from "../infrastructure/dlq-pruner";
import { ClaimReleaseService } from "./services/claim-release-service";
import { ReplayDrainService } from "./services/replay-drain-service";

const pruner = new DlqPruner();
const replayDrain = new ReplayDrainService();
const claimRelease = new ClaimReleaseService();

function startPeriodicPrune(): void {
	pruner.start();
}

function stopPeriodicPrune(): void {
	pruner.stop();
}

function pruneOldEntries(): Promise<number> {
	return pruner.prune();
}

function releaseStaleClaims(staleThresholdMs?: number): Promise<void> {
	return claimRelease.releaseStale(staleThresholdMs);
}

async function shutdownSchedulers(): Promise<void> {
	setShuttingDown(true);
	pruner.stop();
	stopAutoRetry();
	await replayDrain.drain();
	await claimRelease.releaseAndRequeue();
	await _closeResources();
}

async function _closeResources(): Promise<void> {
	await dlqRedisQueue.close();
	await closeHttpClient();
}

export {
	pruneOldEntries,
	releaseStaleClaims,
	shutdownSchedulers,
	startPeriodicPrune,
	stopPeriodicPrune,
};

/** Alias for shutdownSchedulers — consistent with ShutdownHandler.shutdown() naming. */
export function shutdown(): Promise<void> {
	return shutdownSchedulers();
}
