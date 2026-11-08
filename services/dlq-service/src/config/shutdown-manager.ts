import { closeHttpClient } from "../adapters/outbound/http-client-manager";
import { stopAutoRetry } from "../infrastructure/auto-retry-scheduler";
import { DlqPruner } from "../infrastructure/dlq-pruner";
import { setShuttingDown } from "../shared/shutdown-flag";
import { claimReleaseService, replayDrainService } from "./container";
import { dlqRedisQueue } from "./redis-queue";

const pruner = new DlqPruner();
const replayDrain = replayDrainService;
const claimRelease = claimReleaseService;

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
	// Releasing the claims of a replay still in flight would publish it twice.
	if (await replayDrain.drain()) {
		await claimRelease.releaseAndRequeue();
	}
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
