import { getDefaultCircuitRecorder } from "./circuit-recorder";
import type { ServiceInstanceName } from "./services.types";

export function isServiceCircuitOpen(
	serviceName: ServiceInstanceName
): boolean {
	return getDefaultCircuitRecorder().isServiceCircuitOpen(serviceName);
}
