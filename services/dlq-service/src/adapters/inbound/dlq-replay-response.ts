import type { HttpStatusCode } from "@trading-model/contracts/http-status";
import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/http/adapters/inbound/response-exception";
import type { DlqError } from "../../application/services/replay-batch";
import { emitReplayMetrics } from "../../shared/replay-metrics";

export function buildReplayResponse(
	batchId: string,
	successCount: number,
	errors: DlqError[]
): Record<string, unknown> {
	const details = _buildReplayDetails(batchId, successCount, errors);
	emitReplayMetrics(successCount, errors.length);
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
