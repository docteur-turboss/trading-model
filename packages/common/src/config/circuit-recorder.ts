import { Hostname, type URLString } from "../domain/primitives";
import {
	checkHostnameCircuit,
	checkServiceCircuit,
	recordHostnameFailure,
	recordHostnameSuccess,
	recordServiceFailure,
	recordServiceSuccess,
} from "./http-circuit-breaker";
import type { HttpRequestOptions } from "./http-types";
import { parseServiceName, type ServiceInstanceName } from "./services.types";

export interface ServiceRoute {
	hostname: Hostname;
	serviceName?: ServiceInstanceName;
}

export class CircuitRecorder {
	checkPreconditions(
		urlStr: URLString,
		options?: HttpRequestOptions
	): ServiceRoute {
		const hostname = Hostname.of(new URL(urlStr).hostname);
		const rawServiceName = options?.serviceName;
		const serviceName = rawServiceName
			? parseServiceName(rawServiceName)
			: undefined;
		checkHostnameCircuit(hostname);
		if (serviceName) {
			checkServiceCircuit(serviceName);
		}
		return { hostname, serviceName };
	}

	recordSuccess(route: ServiceRoute): void {
		recordHostnameSuccess(route.hostname);
		if (route.serviceName) {
			recordServiceSuccess(route.serviceName);
		}
	}

	recordFailure(route: ServiceRoute, serviceInstanceCount?: number): void {
		recordHostnameFailure(route.hostname);
		if (route.serviceName) {
			recordServiceFailure(route.serviceName, serviceInstanceCount);
		}
	}
}
