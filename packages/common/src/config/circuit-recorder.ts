import type { HttpRequestOptions } from "./http-types";
import {
	checkHostnameCircuit,
	checkServiceCircuit,
	recordHostnameFailure,
	recordHostnameSuccess,
	recordServiceFailure,
	recordServiceSuccess,
} from "./http-circuit-breaker";

export interface ServiceRoute {
	hostname: string;
	serviceName?: string;
}

export class CircuitRecorder {
	checkPreconditions(
		urlStr: string,
		options?: HttpRequestOptions
	): ServiceRoute {
		const hostname = new URL(urlStr).hostname;
		const serviceName = options?.serviceName;
		checkHostnameCircuit(hostname);
		if (serviceName) {
			checkServiceCircuit(serviceName);
		}
		return { hostname, serviceName };
	}

	recordSuccess(hostname: string, serviceName: string | undefined): void {
		recordHostnameSuccess(hostname);
		if (serviceName) {
			recordServiceSuccess(serviceName);
		}
	}

	recordFailure(
		hostname: string,
		serviceName: string | undefined,
		serviceInstanceCount?: number
	): void {
		recordHostnameFailure(hostname);
		if (serviceName) {
			recordServiceFailure(serviceName, serviceInstanceCount);
		}
	}
}
