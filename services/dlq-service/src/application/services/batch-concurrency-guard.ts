import type { PositiveInt } from "@trading-model/primitives/primitives";
import { CircuitStateMachine } from "@trading-model/reliability/circuit-state-machine";
import type { DlqEntryRef, DlqError } from "../../shared/types";
import { activeReplays } from "./active-replay-counter";

const MmCircuitBreaker = new CircuitStateMachine(
	CircuitStateMachine.defaultConfig()
);

const MAX_CONCURRENT_BATCHES = 2 as PositiveInt;

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
	entries: DlqEntryRef[]
): { success: number; errors: DlqError[] } | null {
	if (activeReplays.count >= MAX_CONCURRENT_BATCHES) {
		return _rejectAll(entries, "Too many concurrent replay batches");
	}
	if (MmCircuitBreaker.isOpen() && entries.length > 0) {
		return _rejectAll(entries, "Message-manager circuit breaker open");
	}
	return null;
}

export function recordBatchResult(success: number): void {
	if (success > 0) {
		MmCircuitBreaker.recordSuccess();
	} else {
		MmCircuitBreaker.recordFailure();
	}
}
