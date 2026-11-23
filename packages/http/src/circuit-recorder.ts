import {
	parseServiceName,
	type ServiceInstanceName,
} from "@trading-model/common/config/services.types";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import { CircuitState } from "@trading-model/primitives/circuit-state";
import { Hostname, type URLString } from "@trading-model/primitives/primitives";
import { CircuitBreaker } from "@trading-model/reliability/circuit-breaker";
import type { CircuitBreakerConfig } from "@trading-model/reliability/circuit-state-machine";
import { createHttpClientError } from "./http-client-errors";
import type { HttpRequestOptions } from "./http-types";
import { circuitBreakerRejectionsTotal } from "./outbound-metrics";

/** Target of an outbound call: its hostname and optional service name. */
export interface ServiceRoute {
	hostname: Hostname;
	serviceName?: ServiceInstanceName;
}

/** Circuit key of a target: its service name, or its hostname for a call that names no service. */
function targetKey(route: ServiceRoute): string {
	return route.serviceName ?? route.hostname;
}

/** Records outbound call outcomes in one circuit breaker per target. */
export class CircuitRecorder {
	private readonly _circuit: CircuitBreaker;

	constructor(config?: Partial<CircuitBreakerConfig>) {
		this._circuit = new CircuitBreaker(config);
	}

	checkPreconditions(
		urlStr: URLString,
		options?: HttpRequestOptions
	): ServiceRoute {
		const hostname = Hostname.of(new URL(urlStr).hostname);
		const serviceName = options?.serviceName
			? parseServiceName(options.serviceName)
			: undefined;
		const route = { hostname, serviceName };
		const key = targetKey(route);
		if (this._circuit.check(key) === CircuitState.OPEN) {
			circuitBreakerRejectionsTotal.inc({
				target: key,
				kind: serviceName ? "service" : "hostname",
			});
			throw createHttpClientError(
				serviceName
					? `Circuit breaker open for service ${serviceName}`
					: `Circuit breaker open for ${hostname}`,
				HTTP_STATUS.SERVICE_UNAVAILABLE
			);
		}
		return route;
	}

	recordSuccess(route: ServiceRoute): void {
		this._circuit.recordSuccess(targetKey(route));
	}

	recordFailure(route: ServiceRoute): void {
		this._circuit.recordFailure(targetKey(route));
	}
}

const DefaultRecorder = new CircuitRecorder();

/** Returns the process-wide circuit recorder shared by outbound HTTP calls. */
export function getDefaultCircuitRecorder(): CircuitRecorder {
	return DefaultRecorder;
}
