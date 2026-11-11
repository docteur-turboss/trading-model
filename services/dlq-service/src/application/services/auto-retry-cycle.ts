import {
	toMessageId,
	toTopic,
	type URLString,
} from "@trading-model/primitives/primitives";
import type {
	ClaimedEntry,
	ClaimReleasePort,
	DlqReplaySettings,
	EntryClaimPort,
	LogPort,
	MessageManagerLocatorPort,
	ReplayAuditPort,
	RetryLedgerPort,
	ShutdownProbe,
} from "../../domain/ports/replay.port";
import { generateBatchId } from "../../shared/batch-id";
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
	logger: LogPort;
	isShuttingDown: ShutdownProbe;
	/** Counts the outcome of a replay batch. */
	emitReplayMetrics(success: number, failed: number): void;
}

export interface AutoRetryCycle {
	/** One scheduled auto-retry cycle: claim, replay, audit, abandon exhausted entries. */
	tick(): Promise<void>;
	handleAbandonedEntries(source: string): Promise<void>;
}

export function createAutoRetryCycle(deps: AutoRetryCycleDeps): AutoRetryCycle {
	const { logger, isShuttingDown, emitReplayMetrics } = deps;
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
		emitReplayMetrics(result.success, result.errors.length);
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
				service: entry.service,
			})),
			messageManagerUrl,
			batchId
		);

		// Not awaited: no operator waits for the auto-retry; a refusal is logged and counted.
		void deps.audit.notifyReplay({
			batchId,
			topic: toTopic("dlq-service"),
			success,
			failed: errors.length,
			actor: null,
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
