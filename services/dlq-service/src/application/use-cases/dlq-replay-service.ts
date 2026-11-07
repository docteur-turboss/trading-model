import { randomUUID } from "node:crypto";
import type { HttpStatusCode } from "@trading-model/contracts/http-status";
import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/http/adapters/inbound/response-exception";
import {
	type Limit,
	type Topic,
	toInstanceId,
	toMessageId,
	type URLString,
} from "@trading-model/primitives/primitives";
import { doReplayBatch } from "../../config/container";
import type { ReplayEntriesQuery } from "../../config/dlq-adapters";
import {
	claimReleaseManager,
	dlqClaimManager,
	dlqRetryManager,
	notifyReplayAudit,
} from "../../config/dlq-adapters";
import { logger } from "../../config/logger";
import { ENV } from "../../infrastructure/config/env";
import type { ClaimAndReplayOptions } from "../../shared/types";
import type { DlqEntryRef, DlqError } from "../services/replay-batch";
import { mmResolveError, resolveMMUrlOrFail } from "./dlq-replay-resolver";
import { buildReplayResponse, noEntriesResponse } from "./dlq-replay-response";

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
		| import("@trading-model/http/adapters/inbound/response-exception").ResponseObject
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
	query: ReplayEntriesQuery,
	span: import("@opentelemetry/api").Span
): Promise<ResponseObject> {
	span.setAttribute("topic", query.topic ?? "all");
	span.setAttribute("limit", query.limit);

	const messageManagerUrl = await resolveMMUrlOrFail(span);
	if (!messageManagerUrl) {
		return mmResolveError();
	}

	const batchId = query.batchId || randomUUID();
	span.setAttribute("batchId", batchId);

	const result = await _claimAndReplayBatch({
		messageManagerUrl,
		limit: query.limit as Limit,
		batchId,
		topic: query.topic,
		span,
	});
	if (result.response) {
		return result.response;
	}

	return _buildSuccessResponse(
		batchId,
		query.topic,
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
