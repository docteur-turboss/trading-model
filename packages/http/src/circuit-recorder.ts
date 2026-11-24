import {
	parseServiceName,
	type ServiceInstanceName,
} from "@trading-model/common/config/services.types";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import { CircuitState } from "@trading-model/primitives/circuit-state";
import { Hostname, type URLString } from "@trading-model/primitives/primitives";
import { CircuitBreaker } from "@trading-model/reliability/circuit-breaker";
import { createHttpClientError } from "./http-client-errors";
import type { HttpRequestOptions } from "./http-types";
import { circuitBreakerRejectionsTotal } from "./outbound-metrics";

/** Target of an outbound call: its hostname and optional service name. */
export interface ServiceRoute {
	hostname: Hostname;
	serviceName?: ServiceInstanceName;
}

/** Records outbound call outcomes in circuit breakers, one per hostname and per service. */
export class CircuitRecorder {
	private readonly _hostnameCircuit = new CircuitBreaker();
	// Keyed by service name: one state machine per service, default config.
	private readonly _serviceCircuit = new CircuitBreaker();

	checkPreconditions(
		urlStr: URLString,
		options?: HttpRequestOptions
	): ServiceRoute {
		const hostname = Hostname.of(new URL(urlStr).hostname);
		const serviceName = options?.serviceName
			? parseServiceName(options.serviceName)
			: undefined;
		_rejectIfOpen(this._hostnameCircuit, hostname, "hostname", hostname);
		if (serviceName) {
			_rejectIfOpen(
				this._serviceCircuit,
				serviceName,
				"service",
				`service ${serviceName}`
			);
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
}

function _rejectIfOpen(
	circuit: CircuitBreaker,
	target: string,
	kind: "hostname" | "service",
	label: string
): void {
	if (circuit.check(target) === CircuitState.OPEN) {
		circuitBreakerRejectionsTotal.inc({ target, kind });
		throw createHttpClientError(
			`Circuit breaker open for ${label}`,
			HTTP_STATUS.SERVICE_UNAVAILABLE
		);
	}
}

const DefaultRecorder = new CircuitRecorder();

/** Returns the process-wide circuit recorder shared by outbound HTTP calls. */
export function getDefaultCircuitRecorder(): CircuitRecorder {
	return DefaultRecorder;
}
