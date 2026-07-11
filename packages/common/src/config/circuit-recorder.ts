import { Hostname } from "../domain/primitives/hostname";
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
		urlStr: string,
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

	recordSuccess(
		hostname: Hostname,
		serviceName: ServiceInstanceName | undefined
	): void {
		recordHostnameSuccess(hostname);
		if (serviceName) {
			recordServiceSuccess(serviceName);
		}
	}

	recordFailure(
		hostname: Hostname,
		serviceName: ServiceInstanceName | undefined,
		serviceInstanceCount?: number
	): void {
		recordHostnameFailure(hostname);
		if (serviceName) {
			recordServiceFailure(serviceName, serviceInstanceCount);
		}
	}
}
