import { randomUUID } from "node:crypto";

import {
	toInstanceId,
	toMessageId,
	toTopic,
	type Topic,
	type URLString,
} from "@trading-model/common/domain/primitives";
import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/common/middleware/response-exception";

import { ENV } from "../config/env";
import { logger } from "../config/logger";
import { dlqClaimManager } from "./claim-manager";
import { mmResolveError, resolveMMUrlOrFail } from "./dlq-replay-resolver";
import {
	buildReplayResponse,
	noEntriesResponse,
	notifyReplayAudit,
} from "./dlq-replay-response";
import { validateReplayQuery } from "./dlq-replay-validator";
import { type DlqEntryRef, type DlqError, doReplayBatch } from "./replay-batch";
import { dlqRetryManager } from "./retry-manager";
import type { ClaimAndReplayOptions } from "./types";

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
	limit: number,
	batchId: string,
	topic: Topic | undefined
): Promise<Array<{ id: string; message: unknown }>> {
	await dlqClaimManager.releaseStaleClaims();
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
	limit: number,
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
		limit: validation.data.limit,
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
	notifyReplayAudit(batchId, topic, successCount, errors.length);
	return sendResponse(details, 200);
}
