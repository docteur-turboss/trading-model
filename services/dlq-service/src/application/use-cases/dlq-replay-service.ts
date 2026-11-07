import { randomUUID } from "node:crypto";
import type { HttpStatusCode } from "@trading-model/contracts/http-status";
import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/http/adapters/inbound/response-exception";
import {
	type Limit,
	toInstanceId,
	toMessageId,
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
import type { DlqError } from "../services/replay-batch";
import { mmResolveError, resolveMMUrlOrFail } from "./dlq-replay-resolver";
import { buildReplayResponse } from "./dlq-replay-response";

async function _abandonExhaustedIfNeeded(errors: DlqError[]): Promise<void> {
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

	await claimReleaseManager.releaseStaleClaims();
	const instanceId = toInstanceId(ENV.INSTANCE_ID);
	const entries = await dlqClaimManager.claimEntriesForRetry({
		limit: query.limit as Limit,
		batchId,
		instanceId,
		topic: query.topic,
	});
	if (entries.length === 0) {
		return sendResponse(
			{ replayed: 0, message: "No entries available for retry" },
			200 as HttpStatusCode
		);
	}
	span.setAttribute("entriesClaimed", entries.length);

	const { success, errors } = await doReplayBatch({
		entries: entries.map((entry) => ({
			id: toMessageId(entry.id),
			message: entry.message,
			service: entry.service,
		})),
		messageManagerUrl,
		batchId,
		instanceId,
	});
	await _abandonExhaustedIfNeeded(errors);

	span.setAttribute("replayed", success);
	span.setAttribute("failed", errors.length);

	const details = buildReplayResponse(batchId, success, errors);
	notifyReplayAudit({
		batchId,
		topic: query.topic,
		success,
		failed: errors.length,
	});
	return sendResponse(details, 200 as HttpStatusCode);
}
