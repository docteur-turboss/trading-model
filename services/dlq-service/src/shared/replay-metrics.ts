import { metrics } from "../config/metrics";

/** Counts the outcome of one replay batch (manual, auto-retry or Redis queue). */
export function emitReplayMetrics(success: number, failed: number): void {
	if (success > 0) {
		metrics.entriesReplayed.inc(success);
	}
	if (failed > 0) {
		metrics.entriesReplayFailed.inc(failed);
	}
}
