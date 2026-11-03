import {
	toMessageId,
	toTopic,
	type URLString,
} from "@trading-model/primitives/primitives";
import { logger } from "../../config/logger";
import { metrics } from "../../config/metrics";
import type {
	ClaimedEntry,
	ClaimReleasePort,
	DlqReplaySettings,
	EntryClaimPort,
	MessageManagerLocatorPort,
	ReplayAuditPort,
	RetryLedgerPort,
} from "../../domain/ports/replay.ports";
import { generateBatchId } from "../../shared/batch-id";
import { isShuttingDown } from "../../shared/shutdown-flag";
import type {
	BatchResults,
	DlqEntryRef,
	ReplayBatchOptions,
} from "../../shared/types";

export interface AutoRetryCycleDeps {
	claims: EntryClaimPort;
	claimRelease: ClaimReleasePort;
	retryLedger: RetryLedgerPort;
	messageManager: MessageManagerLocatorPort;
	audit: ReplayAuditPort;
	replayBatch(options: ReplayBatchOptions): Promise<BatchResults>;
	settings: DlqReplaySettings;
}

export interface AutoRetryCycle {
	/** One scheduled auto-retry cycle: claim, replay, audit, abandon exhausted entries. */
	tick(): Promise<void>;
	handleAbandonedEntries(source: string): Promise<void>;
}

export function createAutoRetryCycle(deps: AutoRetryCycleDeps): AutoRetryCycle {
	async function handleAbandonedEntries(source: string): Promise<void> {
		const abandoned = await deps.retryLedger.abandonExhaustedEntries();
		if (abandoned > 0) {
			logger.warn(
				`${source}: ${abandoned} entries abandoned after max retries`
			);
		}
	}

	async function resolveMMUrlOrSkip(): Promise<URLString | null> {
		const messageManagerUrl = await deps.messageManager.resolve();
		if (!messageManagerUrl) {
			logger.warn(
				"DLQ auto-retry: cannot resolve message-manager URL, skipping cycle"
			);
			return null;
		}
		return messageManagerUrl;
	}

	async function executeAutoRetryReplay(
		entries: DlqEntryRef[],
		messageManagerUrl: URLString,
		batchId: string
	): Promise<BatchResults> {
		logger.info(`DLQ auto-retry: replaying ${entries.length} entries`);
		const result = await deps.replayBatch({
			entries,
			messageManagerUrl,
			batchId,
			instanceId: deps.settings.instanceId,
		});
		_emitRetryMetrics(result);
		return result;
	}

	function claimEntriesForRetry(batchId: string): Promise<ClaimedEntry[]> {
		return deps.claims.claimEntriesForRetry({
			limit: deps.settings.autoRetryLimit,
			batchId,
			instanceId: deps.settings.instanceId,
		});
	}

	async function executeCycle(messageManagerUrl: URLString): Promise<void> {
		await deps.claimRelease.releaseStaleClaims();

		const batchId = generateBatchId("auto-retry");
		const entries = await claimEntriesForRetry(batchId);
		if (entries.length === 0) {
			await handleAbandonedEntries("DLQ auto-retry");
			return;
		}

		const { success, errors } = await executeAutoRetryReplay(
			entries.map((entry) => ({
				id: toMessageId(entry.id),
				message: entry.message,
			})),
			messageManagerUrl,
			batchId
		);

		deps.audit.notifyReplay({
			batchId,
			topic: toTopic("dlq-service"),
			success,
			failed: errors.length,
		});

		if (errors.length > 0) {
			await handleAbandonedEntries("DLQ auto-retry");
		}

		logger.info(`DLQ auto-retry: ${success} replayed, ${errors.length} failed`);
	}

	return {
		handleAbandonedEntries,
		async tick(): Promise<void> {
			if (!deps.settings.autoRetryEnabled || isShuttingDown()) {
				return;
			}

			const messageManagerUrl = await resolveMMUrlOrSkip();
			if (!messageManagerUrl || isShuttingDown()) {
				return;
			}

			await executeCycle(messageManagerUrl);
		},
	};
}

function _emitRetryMetrics(result: BatchResults): void {
	if (result.success > 0) {
		metrics.entriesReplayed.inc(result.success);
	}
	if (result.errors.length > 0) {
		metrics.entriesReplayFailed.inc(result.errors.length);
	}
}
