import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import {
	AuditSummary,
	Limit,
	toCorrelationId,
	toInstanceId,
	toMessageId,
	toServiceId,
	toTopic,
	UnixTimestamp,
	type URLString,
} from "@trading-model/common/domain/primitives";
import { Severity } from "@trading-model/validation/adapters/inbound/admin/audit.dto";
import { dlqRetryManager } from "../../adapters/outbound/retry-manager";
import { notifyAudit } from "../../config/audit";
import { logger } from "../../config/logger";
import { metrics } from "../../config/metrics";
import { resolveMessageManagerUrl } from "../../dlq/shared/message-manager-resolver";
import { isShuttingDown } from "../../dlq/shared/shutdown-flag";
import { ENV } from "../../infrastructure/config/env";
import { generateBatchId } from "../../shared/batch-id";
import type { DlqEntryRef } from "../../shared/replay-pipeline";
import { doReplayBatch } from "../../shared/replay-pipeline";
import { claimReleaseManager, dlqClaimManager } from "./claim-manager";

export async function handleAbandonedEntries(source: string): Promise<void> {
	const abandoned = await dlqRetryManager.abandonExhaustedEntries();
	if (abandoned > 0) {
		logger.warn(`${source}: ${abandoned} entries abandoned after max retries`);
	}
}

async function resolveMMUrlOrSkip(): Promise<URLString | null> {
	const messageManagerUrl = await resolveMessageManagerUrl();
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
): Promise<{ success: number; errors: Array<{ id: string; error: string }> }> {
	logger.info(`DLQ auto-retry: replaying ${entries.length} entries`);
	const result = await doReplayBatch({
		entries,
		messageManagerUrl,
		batchId,
		instanceId: toInstanceId(ENV.INSTANCE_ID),
	});
	_emitRetryMetrics(result);
	return result;
}

function _emitRetryMetrics(result: {
	success: number;
	errors: Array<{ id: string; error: string }>;
}): void {
	if (result.success > 0) {
		metrics.entriesReplayed.inc(result.success);
	}
	if (result.errors.length > 0) {
		metrics.entriesReplayFailed.inc(result.errors.length);
	}
}

async function _executeAutoRetryCycle(
	messageManagerUrl: URLString
): Promise<void> {
	await claimReleaseManager.releaseStaleClaims();

	const batchId = generateBatchId("auto-retry");
	const entries = await _claimEntriesForRetry(batchId);
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

	_notifyAutoRetryResult(batchId, success, errors.length);

	if (errors.length > 0) {
		await handleAbandonedEntries("DLQ auto-retry");
	}

	logger.info(`DLQ auto-retry: ${success} replayed, ${errors.length} failed`);
}

function _claimEntriesForRetry(
	batchId: string
): Promise<Array<{ id: string; message: unknown }>> {
	return dlqClaimManager.claimEntriesForRetry({
		limit: Limit.of(ENV.DLQ_AUTO_RETRY_LIMIT, 100),
		batchId,
		instanceId: toInstanceId(ENV.INSTANCE_ID),
	});
}

function _notifyAutoRetryResult(
	batchId: string,
	success: number,
	errorsCount: number
): void {
	void notifyAudit({
		timestamp: UnixTimestamp.now(),
		topic: toTopic("dlq-service"),
		publisher: toServiceId(ServiceInstanceName.DlqService),
		correlationId: toCorrelationId(batchId),
		summary: AuditSummary.of(
			`DLQ replay: ${success} succeeded, ${errorsCount} failed`
		),
		severity: errorsCount > 0 ? Severity.Error : Severity.Info,
	});
}

export async function autoRetryTick(): Promise<void> {
	if (!ENV.DLQ_AUTO_RETRY_ENABLED || isShuttingDown()) {
		return;
	}

	const messageManagerUrl = await resolveMMUrlOrSkip();
	if (!messageManagerUrl || isShuttingDown()) {
		return;
	}

	await _executeAutoRetryCycle(messageManagerUrl);
}
