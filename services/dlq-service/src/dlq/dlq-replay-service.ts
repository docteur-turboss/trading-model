import { randomUUID } from "node:crypto";

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
	await dlqClaimManager.releaseStaleClaims();
	const entries = await _claimRetryEntries(limit, batchId, topic);

	if (entries.length === 0) {
		return noEntriesResponse();
	}

	span.setAttribute("entriesClaimed", entries.length);

	const { success: successCount, errors } = await doReplayBatch({
		entries: _toEntryRefs(entries),
		messageManagerUrl,
		batchId,
		instanceId: ENV.INSTANCE_ID,
	});

	await abandonExhaustedIfNeeded(errors);

	span.setAttribute("replayed", successCount);
	span.setAttribute("failed", errors.length);

	return { response: null, successCount, errors };
}

async function _claimRetryEntries(
	limit: number,
	batchId: string,
	topic: string | undefined
): Promise<Array<{ id: string; message: unknown }>> {
	return dlqClaimManager.claimEntriesForRetry({
		limit,
		batchId,
		instanceId: ENV.INSTANCE_ID,
		topic,
	});
}

function _toEntryRefs(
	entries: Array<{ id: string; message: unknown }>
): DlqEntryRef[] {
	return entries.map((entry) => ({
		id: entry.id,
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

	const {
		response: earlyResponse,
		successCount,
		errors,
	} = await _claimAndReplayBatch({
		messageManagerUrl,
		limit: validation.data.limit,
		batchId,
		topic: validation.data.topic,
		span,
	});
	if (earlyResponse) {
		return earlyResponse;
	}

	const details = buildReplayResponse(batchId, successCount, errors);
	notifyReplayAudit(
		batchId,
		validation.data.topic,
		successCount,
		errors.length
	);
	return sendResponse(details, 200);
}
