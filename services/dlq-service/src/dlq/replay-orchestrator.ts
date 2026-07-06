import { randomUUID } from "node:crypto";

import { SpanStatusCode } from "@opentelemetry/api";
import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/common/middleware/response-exception";
import { z } from "zod";
import { notifyAudit } from "../config/audit";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { metrics } from "../config/metrics";
import { dlqClaimManager } from "./claim-manager";
import { dlqRetryManager } from "./retry-manager";
import {
	type DlqEntryRef,
	type DlqError,
	doReplayBatch,
} from "./replay-batch";
import type { ClaimAndReplayOptions } from "./types";
import { resolveMessageManagerUrl } from "./shared/index";

const ReplaySchema = z.object({
	topic: z.string().optional(),
	limit: z.coerce.number().int().positive().max(100).default(50),
	batchId: z.string().optional(),
});

function validateReplayQuery(
	query: unknown,
	span: import("@opentelemetry/api").Span
):
	| { valid: false; response: ResponseObject }
	| { valid: true; data: z.infer<typeof ReplaySchema> } {
	const parsed = ReplaySchema.safeParse(query);
	if (!parsed.success) {
		span.setStatus({
			code: SpanStatusCode.ERROR,
			message: parsed.error.message,
		});
		span.end();
		return {
			valid: false,
			response: sendResponse({ error: parsed.error.message }, 400),
		};
	}
	span.setAttribute("topic", parsed.data.topic ?? "all");
	span.setAttribute("limit", parsed.data.limit);
	return { valid: true, data: parsed.data };
}

async function resolveMMUrlOrFail(
	span: import("@opentelemetry/api").Span
): Promise<string | null> {
	const messageManagerUrl = await resolveMessageManagerUrl();
	if (!messageManagerUrl) {
		span.setStatus({
			code: SpanStatusCode.ERROR,
			message: "Cannot resolve message-manager URL",
		});
		span.end();
		return null;
	}
	return messageManagerUrl;
}

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

function buildReplayResponse(
	batchId: string,
	successCount: number,
	errors: DlqError[]
): Record<string, unknown> {
	const details: Record<string, unknown> = _buildReplayDetails(
		batchId,
		successCount,
		errors
	);
	_emitReplayMetrics(successCount, errors.length);
	return details;
}

function _buildReplayDetails(
	batchId: string,
	successCount: number,
	errors: DlqError[]
): Record<string, unknown> {
	const details: Record<string, unknown> = {
		batchId,
		replayed: successCount,
		failed: errors.length,
	};
	if (errors.length > 0) {
		details.errors = errors;
	}
	return details;
}

function _emitReplayMetrics(successCount: number, errorsCount: number): void {
	if (successCount > 0) {
		metrics.entriesReplayed.inc(successCount);
	}
	if (errorsCount > 0) {
		metrics.entriesReplayFailed.inc(errorsCount);
	}
}

async function _claimAndReplayBatch(options: ClaimAndReplayOptions): Promise<{
	response: ResponseObject | null;
	successCount: number;
	errors: DlqError[];
}> {
	const { messageManagerUrl, limit, batchId, topic, span } = options;
	await dlqClaimManager.releaseStaleClaims();
	const entries = await _claimRetryEntries(limit, batchId, topic);

	if (entries.length === 0) {
		return _noEntriesResponse();
	}

	span.setAttribute("entriesClaimed", entries.length);

	const { success: successCount, errors } = await doReplayBatch({
		entries: _toEntryRefs(entries),
		messageManagerUrl,
		batchId,
		instanceId: env.INSTANCE_ID,
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
		instanceId: env.INSTANCE_ID,
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

function _noEntriesResponse(): {
	response: ResponseObject;
	successCount: 0;
	errors: [];
} {
	return {
		response: sendResponse(
			{ replayed: 0, message: "No entries available for retry" },
			200
		),
		successCount: 0,
		errors: [],
	};
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
		return _mmResolveError();
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
	_notifyReplayAudit(
		batchId,
		validation.data.topic,
		successCount,
		errors.length
	);
	return sendResponse(details, 200);
}

function _mmResolveError(): ResponseObject {
	return sendResponse(
		{
			error:
				"Cannot resolve message-manager URL (no env var, no address-manager)",
		},
		500
	);
}

function _notifyReplayAudit(
	batchId: string,
	topic: string | undefined,
	successCount: number,
	errorsCount: number
): void {
	void notifyAudit({
		timestamp: new Date().toISOString(),
		topic: topic ?? "unknown",
		publisher: "dlq-service",
		correlationId: batchId,
		summary: `DLQ replay: ${successCount} succeeded, ${errorsCount} failed`,
		severity: errorsCount > 0 ? "ERROR" : "INFO",
	});
}
