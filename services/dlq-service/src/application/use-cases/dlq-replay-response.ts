import { emitReplayMetrics } from "../../shared/replay-metrics";
import type { DlqError } from "../services/replay-batch";

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
