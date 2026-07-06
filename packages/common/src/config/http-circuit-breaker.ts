import { CircuitBreaker } from "../reliability/circuit-breaker";
import type { CircuitState } from "../domain/circuit-state";
import { HttpClientError } from "./http-client-errors";

const HOSTNAME_CIRCUIT = new CircuitBreaker({
	failureThreshold: 5,
	cooldownMs: 30_000,
});

const DEFAULT_SERVICE_CB_THRESHOLD = 5;

const SERVICE_CIRCUIT_BREAKERS = new Map<string, CircuitBreakerEntry>();

interface CircuitBreakerEntry {
	failures: number;
	state: CircuitState;
	lastFailureTime: number;
}

function getServiceEntry(serviceName: string): CircuitBreakerEntry {
	let entry = SERVICE_CIRCUIT_BREAKERS.get(serviceName);
	if (!entry) {
		entry = { failures: 0, state: "closed", lastFailureTime: 0 };
		SERVICE_CIRCUIT_BREAKERS.set(serviceName, entry);
	}
	return entry;
}

function getServiceThreshold(instanceCount?: number): number {
	if (instanceCount !== undefined) {
		return Math.max(2, instanceCount * 2);
	}
	return DEFAULT_SERVICE_CB_THRESHOLD;
}

export function checkHostnameCircuit(hostname: string): void {
	const state = HOSTNAME_CIRCUIT.check(hostname);
	if (state === "open") {
		throw new HttpClientError(`Circuit breaker open for ${hostname}`, 503);
	}
}

export function recordHostnameSuccess(hostname: string): void {
	HOSTNAME_CIRCUIT.recordSuccess(hostname);
}

export function recordHostnameFailure(hostname: string): void {
	HOSTNAME_CIRCUIT.recordFailure(hostname);
}

export function checkServiceCircuit(serviceName: string): void {
	const entry = getServiceEntry(serviceName);
	if (entry.state === "open") {
		if (Date.now() - entry.lastFailureTime >= 30_000) {
			entry.state = "half-open";
			return;
		}
		throw new HttpClientError(
			`Circuit breaker open for service ${serviceName}`,
			503
		);
	}
}

export function recordServiceSuccess(serviceName: string): void {
	const entry = getServiceEntry(serviceName);
	entry.failures = 0;
	entry.state = "closed";
}

export function recordServiceFailure(
	serviceName: string,
	instanceCount?: number
): void {
	const entry = getServiceEntry(serviceName);
	entry.failures++;
	entry.lastFailureTime = Date.now();
	const threshold = getServiceThreshold(instanceCount);
	if (entry.failures >= threshold) {
		entry.state = "open";
	}
}

export function isServiceCircuitOpen(serviceName: string): boolean {
	const entry = SERVICE_CIRCUIT_BREAKERS.get(serviceName);
	if (!entry || entry.state === "closed") {
		return false;
	}
	if (entry.state === "open") {
		if (Date.now() - entry.lastFailureTime >= 30_000) {
			entry.state = "half-open";
			return false;
		}
		return true;
	}
	return true;
}
