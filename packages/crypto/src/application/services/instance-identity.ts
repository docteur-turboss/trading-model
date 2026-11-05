import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { InstanceId } from "@trading-model/primitives/primitives";
import type { ServiceEndpoint } from "@trading-model/primitives/service-identity";
import { createHmacSha256Formatted } from "../../adapters/outbound/node-hmac";
import { generateRandomStr } from "../../adapters/outbound/node-random";

/** Generates a unique, unguessable instance id for a service endpoint. */
export function generateInstanceId({
	serviceName,
	host,
	port,
}: ServiceEndpoint): string {
	return createHmacSha256Formatted({
		secret: generateRandomStr(),
		parts: [`${serviceName}-${host}:${port}-${Date.now()}`],
		separator: ":",
		digest: "base64",
	});
}

/** Returns true when the name is a known service instance name. */
export function verifyInstanceName(serviceName: ServiceInstanceName): boolean {
	return (Object.values(ServiceInstanceName) as readonly string[]).includes(
		InstanceId.of(serviceName)
	);
}
