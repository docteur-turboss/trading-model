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
