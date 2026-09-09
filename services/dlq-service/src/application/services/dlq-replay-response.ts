import type { HttpStatusCode } from "@trading-model/common/http-status";
import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/common/middleware/response-exception";
import { metrics } from "../../config/metrics";
import type { DlqError } from "./replay-batch";

export function buildReplayResponse(
	batchId: string,
	successCount: number,
	errors: DlqError[]
): Record<string, unknown> {
	const details = _buildReplayDetails(batchId, successCount, errors);
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

export function noEntriesResponse(): {
	response: ResponseObject;
	successCount: 0;
	errors: [];
} {
	return {
		response: sendResponse(
			{ replayed: 0, message: "No entries available for retry" },
			200 as HttpStatusCode
		),
		successCount: 0,
		errors: [],
	};
}
