import { CircuitBreaker } from "../reliability/circuit-breaker";
import { HttpClientError } from "./http-client-errors";

const HOSTNAME_CIRCUIT = new CircuitBreaker({
	failureThreshold: 5,
	cooldownMs: 30_000,
});

const SERVICE_CIRCUITS = new Map<string, CircuitBreaker>();

function getServiceCircuit(serviceName: string): CircuitBreaker {
	let cb = SERVICE_CIRCUITS.get(serviceName);
	if (!cb) {
		cb = new CircuitBreaker({ failureThreshold: 5, cooldownMs: 30_000 });
		SERVICE_CIRCUITS.set(serviceName, cb);
	}
	return cb;
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
	const cb = getServiceCircuit(serviceName);
	const state = cb.check(serviceName);
	if (state === "open") {
		throw new HttpClientError(
			`Circuit breaker open for service ${serviceName}`,
			503
		);
	}
}

export function recordServiceSuccess(serviceName: string): void {
	getServiceCircuit(serviceName).recordSuccess(serviceName);
}

export function recordServiceFailure(
	serviceName: string,
	instanceCount?: number
): void {
	const cb = getServiceCircuit(serviceName);
	const threshold =
		instanceCount === undefined ? undefined : Math.max(2, instanceCount * 2);
	cb.recordFailure(serviceName, 1, threshold);
}

export function isServiceCircuitOpen(serviceName: string): boolean {
	const cb = SERVICE_CIRCUITS.get(serviceName);
	if (!cb) {
		return false;
	}
	const state = cb.check(serviceName);
	return state === "open" || state === "half-open";
}
