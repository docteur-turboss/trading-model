import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { InstanceId } from "@trading-model/common/domain/primitives";
import type { ServiceEndpoint } from "@trading-model/common/domain/service-identity";
import { createHmacSha256Formatted } from "../../adapters/outbound/node-hmac";
import { generateRandomStr } from "../../adapters/outbound/node-random";

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

export function verifyInstanceName(serviceName: ServiceInstanceName): boolean {
	return (Object.values(ServiceInstanceName) as readonly string[]).includes(
		InstanceId.of(serviceName)
	);
}
