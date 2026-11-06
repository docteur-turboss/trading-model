import type { DlqError } from "../../application/services/replay-batch";
import { emitReplayMetrics } from "../../shared/replay-metrics";

export function buildReplayResponse(
	batchId: string,
	successCount: number,
	errors: DlqError[]
): Record<string, unknown> {
	emitReplayMetrics(successCount, errors.length);
	return {
		batchId,
		replayed: successCount,
		failed: errors.length,
		...(errors.length > 0 && { errors }),
	};
}
