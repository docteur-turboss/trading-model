import { HttpClientError } from "./http-client-errors";

type CircuitState = "closed" | "open" | "half-open";

interface CircuitBreakerEntry {
	failures: number;
	state: CircuitState;
	lastFailureTime: number;
}

const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_COOLDOWN_MS = 30_000;

const HOSTNAME_CIRCUIT_BREAKERS = new Map<string, CircuitBreakerEntry>();
const DEFAULT_SERVICE_CB_THRESHOLD = 5;
const SERVICE_CIRCUIT_COOLDOWN_MS = 30_000;
const SERVICE_CIRCUIT_BREAKERS = new Map<string, CircuitBreakerEntry>();

function getHostnameEntry(hostname: string): CircuitBreakerEntry {
	let entry = HOSTNAME_CIRCUIT_BREAKERS.get(hostname);
	if (!entry) {
		entry = { failures: 0, state: "closed", lastFailureTime: 0 };
		HOSTNAME_CIRCUIT_BREAKERS.set(hostname, entry);
	}
	return entry;
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
	const entry = getHostnameEntry(hostname);
	if (entry.state === "open") {
		if (Date.now() - entry.lastFailureTime >= CIRCUIT_COOLDOWN_MS) {
			entry.state = "half-open";
			return;
		}
		throw new HttpClientError(`Circuit breaker open for ${hostname}`, 503);
	}
}

export function recordHostnameSuccess(hostname: string): void {
	const entry = getHostnameEntry(hostname);
	entry.failures = 0;
	entry.state = "closed";
}

export function recordHostnameFailure(hostname: string): void {
	const entry = getHostnameEntry(hostname);
	entry.failures++;
	entry.lastFailureTime = Date.now();
	if (entry.failures >= CIRCUIT_BREAKER_THRESHOLD) {
		entry.state = "open";
	}
}

export function checkServiceCircuit(serviceName: string): void {
	const entry = getServiceEntry(serviceName);
	if (entry.state === "open") {
		if (Date.now() - entry.lastFailureTime >= SERVICE_CIRCUIT_COOLDOWN_MS) {
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
		if (Date.now() - entry.lastFailureTime >= SERVICE_CIRCUIT_COOLDOWN_MS) {
			entry.state = "half-open";
			return false;
		}
		return true;
	}
	return true;
}
