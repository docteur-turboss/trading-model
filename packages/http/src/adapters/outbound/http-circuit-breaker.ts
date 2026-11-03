import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { getDefaultCircuitRecorder } from "./circuit-recorder";

export function isServiceCircuitOpen(
	serviceName: ServiceInstanceName
): boolean {
	return getDefaultCircuitRecorder().isServiceCircuitOpen(serviceName);
}
