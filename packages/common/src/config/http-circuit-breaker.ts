import { CircuitState } from "../domain/circuit-state";
import { DurationMs } from "../domain/primitives";
import type { Hostname } from "../domain/primitives/hostname";
import { HTTP_STATUS } from "../http-status";
import { CircuitBreaker } from "../reliability/circuit-breaker";
import { HttpClientError } from "./http-client-errors";
import type { ServiceInstanceName } from "./services.types";

const HOSTNAME_CIRCUIT = new CircuitBreaker({
	failureThreshold: 5,
	cooldownMs: DurationMs.of(30_000),
});

const SERVICE_CIRCUITS = new Map<string, CircuitBreaker>();

function getServiceCircuit(serviceName: ServiceInstanceName): CircuitBreaker {
	let cb = SERVICE_CIRCUITS.get(serviceName);
	if (!cb) {
		cb = new CircuitBreaker({
			failureThreshold: 5,
			cooldownMs: DurationMs.of(30_000),
		});
		SERVICE_CIRCUITS.set(serviceName, cb);
	}
	return cb;
}

export function checkHostnameCircuit(hostname: Hostname): void {
	const state = HOSTNAME_CIRCUIT.check(hostname);
	if (state === CircuitState.OPEN) {
		throw new HttpClientError(
			`Circuit breaker open for ${hostname}`,
			HTTP_STATUS.SERVICE_UNAVAILABLE
		);
	}
}

export function recordHostnameSuccess(hostname: Hostname): void {
	HOSTNAME_CIRCUIT.recordSuccess(hostname);
}

export function recordHostnameFailure(hostname: Hostname): void {
	HOSTNAME_CIRCUIT.recordFailure(hostname);
}

export function checkServiceCircuit(serviceName: ServiceInstanceName): void {
	const cb = getServiceCircuit(serviceName);
	const state = cb.check(serviceName);
	if (state === CircuitState.OPEN) {
		throw new HttpClientError(
			`Circuit breaker open for service ${serviceName}`,
			HTTP_STATUS.SERVICE_UNAVAILABLE
		);
	}
}

export function recordServiceSuccess(serviceName: ServiceInstanceName): void {
	getServiceCircuit(serviceName).recordSuccess(serviceName);
}

export function recordServiceFailure(
	serviceName: ServiceInstanceName,
	instanceCount?: number
): void {
	const cb = getServiceCircuit(serviceName);
	const threshold =
		instanceCount === undefined ? undefined : Math.max(2, instanceCount * 2);
	cb.recordFailure(serviceName, 1, threshold);
}

export function isServiceCircuitOpen(
	serviceName: ServiceInstanceName
): boolean {
	const cb = SERVICE_CIRCUITS.get(serviceName);
	if (!cb) {
		return false;
	}
	const state = cb.check(serviceName);
	return state === CircuitState.OPEN || state === CircuitState.HALF_OPEN;
}
