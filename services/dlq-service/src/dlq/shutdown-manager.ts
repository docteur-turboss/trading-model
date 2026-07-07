import { stopAutoRetry } from "./auto-retry-scheduler";
import { ClaimReleaseService } from "./claim-release-service";
import { closeHttpClient } from "./shared/http-client-manager";
import { dlqRedisQueue } from "../config/redis-queue";
import { DlqPruner } from "./dlq-pruner";
import { ReplayDrainService } from "./replay-drain-service";
import { setShuttingDown } from "./shared/shutdown-flag";

const pruner = new DlqPruner();
const replayDrain = new ReplayDrainService();
const claimRelease = new ClaimReleaseService();

function startPeriodicPrune(): void {
	pruner.start();
}

function stopPeriodicPrune(): void {
	pruner.stop();
}

async function pruneOldEntries(): Promise<number> {
	return pruner.prune();
}

async function releaseStaleClaims(staleThresholdMs?: number): Promise<void> {
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
export async function shutdown(): Promise<void> {
	return shutdownSchedulers();
}
