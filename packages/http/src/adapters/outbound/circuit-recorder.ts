import {
	parseServiceName,
	type ServiceInstanceName,
} from "@trading-model/common/config/services.types";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import { CircuitState } from "@trading-model/primitives/circuit-state";
import { Hostname, type URLString } from "@trading-model/primitives/primitives";
import { CircuitBreaker } from "@trading-model/reliability/circuit-breaker";
import type { CircuitBreakerConfig } from "@trading-model/reliability/circuit-state-machine";
import type { HttpRequestOptions } from "../../domain/http-types";
import { circuitBreakerRejectionsTotal } from "../../infrastructure/outbound-metrics";
import { createHttpClientError } from "./http-client-errors";

/** Target of an outbound call: its hostname and optional service name. */
export interface ServiceRoute {
	hostname: Hostname;
	serviceName?: ServiceInstanceName;
}

/** Records outbound call outcomes in circuit breakers, one per hostname and per service. */
export class CircuitRecorder {
	private readonly _hostnameCircuit: CircuitBreaker;
	// Keyed by service name: one state machine per service, default config.
	private readonly _serviceCircuit = new CircuitBreaker();

	constructor(config?: Partial<CircuitBreakerConfig>) {
		this._hostnameCircuit = new CircuitBreaker(config);
	}

	checkPreconditions(
		urlStr: URLString,
		options?: HttpRequestOptions
	): ServiceRoute {
		const hostname = Hostname.of(new URL(urlStr).hostname);
		const rawServiceName = options?.serviceName;
		const serviceName = rawServiceName
			? parseServiceName(rawServiceName)
			: undefined;
		const hostState = this._hostnameCircuit.check(hostname);
		if (hostState === CircuitState.OPEN) {
			circuitBreakerRejectionsTotal.inc({ target: hostname, kind: "hostname" });
			throw createHttpClientError(
				`Circuit breaker open for ${hostname}`,
				HTTP_STATUS.SERVICE_UNAVAILABLE
			);
		}
		if (serviceName) {
			const svcState = this._serviceCircuit.check(serviceName);
			if (svcState === CircuitState.OPEN) {
				circuitBreakerRejectionsTotal.inc({
					target: serviceName,
					kind: "service",
				});
				throw createHttpClientError(
					`Circuit breaker open for service ${serviceName}`,
					HTTP_STATUS.SERVICE_UNAVAILABLE
				);
			}
		}
		return { hostname, serviceName };
	}

	recordSuccess(route: ServiceRoute): void {
		this._hostnameCircuit.recordSuccess(route.hostname);
		if (route.serviceName) {
			this._serviceCircuit.recordSuccess(route.serviceName);
		}
	}

	recordFailure(route: ServiceRoute): void {
		this._hostnameCircuit.recordFailure(route.hostname);
		if (route.serviceName) {
			this._serviceCircuit.recordFailure(route.serviceName);
		}
	}

	isServiceCircuitOpen(serviceName: ServiceInstanceName): boolean {
		const state = this._serviceCircuit.check(serviceName);
		return state === CircuitState.OPEN || state === CircuitState.HALF_OPEN;
	}
}

const DefaultRecorder = new CircuitRecorder();

/** Returns the process-wide circuit recorder shared by outbound HTTP calls. */
export function getDefaultCircuitRecorder(): CircuitRecorder {
	return DefaultRecorder;
}
