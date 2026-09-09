import { randomUUID } from "node:crypto";

import {
	type Limit,
	type Topic,
	toInstanceId,
	toMessageId,
	toTopic,
	type URLString,
} from "@trading-model/common/domain/primitives";
import type { HttpStatusCode } from "@trading-model/common/http-status";
import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/common/middleware/response-exception";
import { validateReplayQuery } from "../../adapters/inbound/dlq-replay-validator";
import { notifyReplayAudit } from "../../adapters/outbound/audit-notifier";
import { dlqRetryManager } from "../../adapters/outbound/retry-manager";
import { logger } from "../../config/logger";
import { ENV } from "../../infrastructure/config/env";
import {
	mmResolveError,
	resolveMMUrlOrFail,
} from "../../infrastructure/dlq-replay-resolver";
import type { ClaimAndReplayOptions } from "../../shared/types";
import { claimReleaseManager, dlqClaimManager } from "./claim-manager";
import { buildReplayResponse, noEntriesResponse } from "./dlq-replay-response";
import { type DlqEntryRef, type DlqError, doReplayBatch } from "./replay-batch";

export async function abandonExhaustedIfNeeded(
	errors: DlqError[]
): Promise<void> {
	if (errors.length === 0) {
		return;
	}
	const abandoned = await dlqRetryManager.abandonExhaustedEntries();
	if (abandoned > 0) {
		logger.warn(
			`DLQ manual replay: ${abandoned} entries abandoned after max retries`
		);
	}
}

async function _claimAndReplayBatch(options: ClaimAndReplayOptions): Promise<{
	response:
		| import("@trading-model/common/middleware/response-exception").ResponseObject
		| null;
	successCount: number;
	errors: DlqError[];
}> {
	const { messageManagerUrl, limit, batchId, topic, span } = options;
	const entries = await _releaseAndClaimEntries(limit, batchId, topic);

	if (entries.length === 0) {
		return noEntriesResponse();
	}

	span.setAttribute("entriesClaimed", entries.length);

	const result = await _executeBatchReplay(entries, messageManagerUrl, batchId);
	await abandonExhaustedIfNeeded(result.errors);

	span.setAttribute("replayed", result.success);
	span.setAttribute("failed", result.errors.length);

	return {
		response: null,
		successCount: result.success,
		errors: result.errors,
	};
}

async function _releaseAndClaimEntries(
	limit: Limit,
	batchId: string,
	topic: Topic | undefined
): Promise<Array<{ id: string; message: unknown }>> {
	await claimReleaseManager.releaseStaleClaims();
	return _claimRetryEntries(limit, batchId, topic);
}

function _executeBatchReplay(
	entries: Array<{ id: string; message: unknown }>,
	messageManagerUrl: URLString,
	batchId: string
): Promise<{ success: number; errors: DlqError[] }> {
	return doReplayBatch({
		entries: _toEntryRefs(entries),
		messageManagerUrl,
		batchId,
		instanceId: toInstanceId(ENV.INSTANCE_ID),
	});
}

function _claimRetryEntries(
	limit: Limit,
	batchId: string,
	topic: Topic | undefined
): Promise<Array<{ id: string; message: unknown }>> {
	return dlqClaimManager.claimEntriesForRetry({
		limit,
		batchId,
		instanceId: toInstanceId(ENV.INSTANCE_ID),
		topic,
	});
}

function _toEntryRefs(
	entries: Array<{ id: string; message: unknown }>
): DlqEntryRef[] {
	return entries.map((entry) => ({
		id: toMessageId(entry.id),
		message: entry.message,
	}));
}

export async function executeReplayPipeline(
	query: unknown,
	span: import("@opentelemetry/api").Span
): Promise<ResponseObject> {
	const validation = validateReplayQuery(query, span);
	if (!validation.valid) {
		return validation.response;
	}

	const messageManagerUrl = await resolveMMUrlOrFail(span);
	if (!messageManagerUrl) {
		return mmResolveError();
	}

	const batchId = validation.data.batchId || randomUUID();
	span.setAttribute("batchId", batchId);

	const result = await _claimAndReplayBatch({
		messageManagerUrl,
		limit: validation.data.limit as Limit,
		batchId,
		topic: validation.data.topic ? toTopic(validation.data.topic) : undefined,
		span,
	});
	if (result.response) {
		return result.response;
	}

	return _buildSuccessResponse(
		batchId,
		validation.data.topic ? toTopic(validation.data.topic) : undefined,
		result.successCount,
		result.errors
	);
}

function _buildSuccessResponse(
	batchId: string,
	topic: Topic | undefined,
	successCount: number,
	errors: DlqError[]
): ResponseObject {
	const details = buildReplayResponse(batchId, successCount, errors);
	notifyReplayAudit({
		batchId,
		topic,
		success: successCount,
		failed: errors.length,
	});
	return sendResponse(details, 200 as HttpStatusCode);
}
