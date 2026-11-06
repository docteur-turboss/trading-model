import {
	parseServiceName,
	type ServiceInstanceName,
} from "@trading-model/common/config/services.types";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import { CircuitState } from "@trading-model/primitives/circuit-state";
import { Hostname, type URLString } from "@trading-model/primitives/primitives";
import { CircuitBreaker } from "@trading-model/reliability/circuit-breaker";
import type { ICircuitBreaker } from "@trading-model/reliability/circuit-breaker.interface";
import type { CircuitBreakerConfig } from "@trading-model/reliability/circuit-state-machine";
import type { HttpRequestOptions } from "../../domain/http-types";
import { createHttpClientError } from "./http-client-errors";

export interface ServiceRoute {
	hostname: Hostname;
	serviceName?: ServiceInstanceName;
}

export class CircuitRecorder {
	private readonly _hostnameCircuit: ICircuitBreaker;
	// Keyed by service name: one state machine per service, default config.
	private readonly _serviceCircuit: ICircuitBreaker = new CircuitBreaker();

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
			throw createHttpClientError(
				`Circuit breaker open for ${hostname}`,
				HTTP_STATUS.SERVICE_UNAVAILABLE
			);
		}
		if (serviceName) {
			const svcState = this._serviceCircuit.check(serviceName);
			if (svcState === CircuitState.OPEN) {
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

	recordFailure(route: ServiceRoute, serviceInstanceCount?: number): void {
		this._hostnameCircuit.recordFailure(route.hostname);
		if (route.serviceName) {
			const threshold =
				serviceInstanceCount === undefined
					? undefined
					: Math.max(2, serviceInstanceCount * 2);
			this._serviceCircuit.recordFailure(route.serviceName, 1, threshold);
		}
	}

	isServiceCircuitOpen(serviceName: ServiceInstanceName): boolean {
		const state = this._serviceCircuit.check(serviceName);
		return state === CircuitState.OPEN || state === CircuitState.HALF_OPEN;
	}
}

const DefaultRecorder = new CircuitRecorder();

export function getDefaultCircuitRecorder(): CircuitRecorder {
	return DefaultRecorder;
}
