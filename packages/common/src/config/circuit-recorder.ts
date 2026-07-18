import { CircuitState } from "../domain/circuit-state";
import { Hostname, type URLString } from "../domain/primitives";
import { HTTP_STATUS } from "../http-status";
import { CircuitBreaker } from "../reliability/circuit-breaker";
import type { ICircuitBreaker } from "../reliability/circuit-breaker.interface";
import type { CircuitBreakerConfig } from "../reliability/circuit-state-machine";
import { createHttpClientError } from "./http-client-errors";
import type { HttpRequestOptions } from "./http-types";
import { parseServiceName, type ServiceInstanceName } from "./services.types";

export interface ServiceRoute {
	hostname: Hostname;
	serviceName?: ServiceInstanceName;
}

export class CircuitRecorder {
	private readonly _hostnameCircuit: ICircuitBreaker;
	private readonly _serviceCircuits = new Map<string, ICircuitBreaker>();

	constructor(config?: Partial<CircuitBreakerConfig>) {
		this._hostnameCircuit = new CircuitBreaker(config);
	}

	private _getServiceCircuit(
		serviceName: ServiceInstanceName
	): ICircuitBreaker {
		let cb = this._serviceCircuits.get(serviceName);
		if (!cb) {
			cb = new CircuitBreaker();
			this._serviceCircuits.set(serviceName, cb);
		}
		return cb;
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
			const svcCircuit = this._getServiceCircuit(serviceName);
			const svcState = svcCircuit.check(serviceName);
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
			this._getServiceCircuit(route.serviceName).recordSuccess(
				route.serviceName
			);
		}
	}

	recordFailure(route: ServiceRoute, serviceInstanceCount?: number): void {
		this._hostnameCircuit.recordFailure(route.hostname);
		if (route.serviceName) {
			const svcCircuit = this._getServiceCircuit(route.serviceName);
			const threshold =
				serviceInstanceCount === undefined
					? undefined
					: Math.max(2, serviceInstanceCount * 2);
			svcCircuit.recordFailure(route.serviceName, 1, threshold);
		}
	}

	isServiceCircuitOpen(serviceName: ServiceInstanceName): boolean {
		const cb = this._serviceCircuits.get(serviceName);
		if (!cb) {
			return false;
		}
		const state = cb.check(serviceName);
		return state === CircuitState.OPEN || state === CircuitState.HALF_OPEN;
	}
}

const DefaultRecorder = new CircuitRecorder();

export function getDefaultCircuitRecorder(): CircuitRecorder {
	return DefaultRecorder;
}
