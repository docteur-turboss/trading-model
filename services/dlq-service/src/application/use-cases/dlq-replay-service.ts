import { randomUUID } from "node:crypto";
import type { Span } from "@opentelemetry/api";
import { SpanStatusCode } from "@opentelemetry/api";
import { logger } from "@trading-model/http/infrastructure/logger";
import {
	type Limit,
	type Topic,
	toMessageId,
} from "@trading-model/primitives/primitives";
import type { DlqMetricsPort } from "../../domain/ports/dlq.port";
import type {
	ClaimReleasePort,
	DlqReplaySettings,
	EntryClaimPort,
	MessageManagerLocatorPort,
	ReplayAuditPort,
	RetryLedgerPort,
} from "../../domain/ports/replay.port";
import type { BatchResults, ReplayBatchOptions } from "../../shared/types";
import { buildReplayResponse } from "./dlq-replay-response";

export interface ReplayRequest {
	topic?: Topic;
	limit: number;
	batchId?: string;
	/** API key name of the operator (ADR-0059), null when not called through api-gateway. */
	actor: string | null;
}

/** Outcome of a manual replay; the inbound adapter maps it to an HTTP response. */
export type ReplayResult =
	| { status: "message-manager-unresolved" }
	| { status: "no-entries" }
	| {
			status: "replayed";
			details: Record<string, unknown>;
			/** False: replayed, but message-manager refused the audit event (ADR-0059). */
			auditRecorded: boolean;
	  };

export interface ReplayEntriesDeps {
	messageManager: MessageManagerLocatorPort;
	claimRelease: Pick<ClaimReleasePort, "releaseStaleClaims">;
	claims: Pick<EntryClaimPort, "claimEntriesForRetry">;
	retryLedger: RetryLedgerPort;
	replayBatch(options: ReplayBatchOptions): Promise<BatchResults>;
	audit: Pick<ReplayAuditPort, "notifyReplay">;
	metrics: Pick<DlqMetricsPort, "batchReplayed">;
	settings: Pick<DlqReplaySettings, "instanceId">;
}

async function _abandonExhaustedIfNeeded(
	deps: ReplayEntriesDeps,
	failed: number
): Promise<void> {
	if (failed === 0) {
		return;
	}
	const abandoned = await deps.retryLedger.abandonExhaustedEntries();
	if (abandoned > 0) {
		logger.warn(
			`DLQ manual replay: ${abandoned} entries abandoned after max retries`
		);
	}
}

export function createReplayEntries(
	deps: ReplayEntriesDeps
): (request: ReplayRequest, span: Span) => Promise<ReplayResult> {
	return async (request, span) => {
		span.setAttribute("topic", request.topic ?? "all");
		span.setAttribute("limit", request.limit);

		const messageManagerUrl = await deps.messageManager.resolve();
		if (!messageManagerUrl) {
			span.setStatus({
				code: SpanStatusCode.ERROR,
				message: "Cannot resolve message-manager URL",
			});
			span.end();
			return { status: "message-manager-unresolved" };
		}

		const batchId = request.batchId || randomUUID();
		span.setAttribute("batchId", batchId);

		await deps.claimRelease.releaseStaleClaims();
		const instanceId = deps.settings.instanceId;
		const entries = await deps.claims.claimEntriesForRetry({
			limit: request.limit as Limit,
			batchId,
			instanceId,
			topic: request.topic,
		});
		if (entries.length === 0) {
			return { status: "no-entries" };
		}
		span.setAttribute("entriesClaimed", entries.length);

		const { success, errors } = await deps.replayBatch({
			entries: entries.map((entry) => ({
				id: toMessageId(entry.id),
				message: entry.message,
				service: entry.service,
			})),
			messageManagerUrl,
			batchId,
			instanceId,
		});
		await _abandonExhaustedIfNeeded(deps, errors.length);

		span.setAttribute("replayed", success);
		span.setAttribute("failed", errors.length);

		deps.metrics.batchReplayed(success, errors.length);
		const auditRecorded = await deps.audit.notifyReplay({
			batchId,
			topic: request.topic,
			success,
			failed: errors.length,
			actor: request.actor,
		});
		return {
			status: "replayed",
			details: buildReplayResponse(batchId, success, errors),
			auditRecorded,
		};
	};
}
