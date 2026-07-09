import { CircuitStateMachine } from "@trading-model/common/reliability/circuit-state-machine";
import type { DlqEntryRef, DlqError } from "./types";

const MmCircuitBreaker = new CircuitStateMachine({
	failureThreshold: 5,
	cooldownMs: 30_000,
});

let activeBatches = 0;
const MAX_CONCURRENT_BATCHES = 2;

function _rejectAll(
	entries: DlqEntryRef[],
	error: string
): { success: number; errors: DlqError[] } {
	return {
		success: 0,
		errors: entries.map((entry) => ({ id: entry.id, error })),
	};
}

export function checkBatchRejection(
	entries: DlqEntryRef[],
	_batchId: string
): { success: number; errors: DlqError[] } | null {
	if (activeBatches >= MAX_CONCURRENT_BATCHES) {
		return _rejectAll(entries, "Too many concurrent replay batches");
	}
	if (MmCircuitBreaker.isOpen() && entries.length > 0) {
		return _rejectAll(entries, "Message-manager circuit breaker open");
	}
	return null;
}

export function incrementActiveBatches(): void {
	activeBatches++;
}

export function decrementActiveBatches(): void {
	activeBatches--;
}

export function recordBatchResult(success: number): void {
	if (success > 0) {
		MmCircuitBreaker.recordSuccess();
	} else {
		MmCircuitBreaker.recordFailure();
	}
}
