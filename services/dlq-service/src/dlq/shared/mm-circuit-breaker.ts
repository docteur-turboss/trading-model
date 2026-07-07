import { logger } from "../../config/logger";

let mmCircuitFailures = 0;
let mmCircuitOpenUntil = 0;
let mmHalfOpenAttempts = 0;
const MM_CIRCUIT_THRESHOLD = 5;
const MM_CIRCUIT_RESET_MS = 30_000;
const MM_CIRCUIT_HALF_OPEN_MAX_ATTEMPTS = 2;

export function isMMCircuitOpen(): boolean {
	if (mmCircuitOpenUntil > Date.now()) {
		return true;
	}
	if (mmCircuitOpenUntil > 0) {
		mmCircuitFailures = 0;
		mmCircuitOpenUntil = 0;
		mmHalfOpenAttempts = 0;
	}
	return false;
}

export function recordMMResult(success: boolean): void {
	if (success) {
		_resetMMCircuit();
	} else {
		_recordMMFailure();
	}
}

function _resetMMCircuit(): void {
	if (mmCircuitFailures > 0) {
		mmCircuitFailures = 0;
	}
	mmCircuitOpenUntil = 0;
	mmHalfOpenAttempts = 0;
}

function _recordMMFailure(): void {
	mmCircuitFailures++;
	_checkHalfOpenReopen();
	_checkThresholdOpen();
}

function _checkHalfOpenReopen(): void {
	if (mmCircuitOpenUntil <= 0) {
		return;
	}
	mmHalfOpenAttempts++;
	if (mmHalfOpenAttempts >= MM_CIRCUIT_HALF_OPEN_MAX_ATTEMPTS) {
		mmCircuitOpenUntil = Date.now() + MM_CIRCUIT_RESET_MS;
		logger.warn("Message-manager circuit breaker re-opened during half-open", {
			failures: mmCircuitFailures,
			halfOpenAttempts: mmHalfOpenAttempts,
			resetMs: MM_CIRCUIT_RESET_MS,
		});
	}
}

function _checkThresholdOpen(): void {
	if (mmCircuitFailures < MM_CIRCUIT_THRESHOLD) {
		return;
	}
	mmCircuitOpenUntil = Date.now() + MM_CIRCUIT_RESET_MS;
	logger.warn("Message-manager circuit breaker opened", {
		failures: mmCircuitFailures,
		resetMs: MM_CIRCUIT_RESET_MS,
	});
}
