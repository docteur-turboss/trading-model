import { createHmac } from "node:crypto";
import { ServiceInstanceName } from "../config/services.types";
import { InstanceId } from "../domain/primitives";
import type { ServiceEndpoint } from "../domain/service-identity";
import { CryptoAlg } from "./crypto-constants";
import { generateRandomStr } from "./random";

export function generateInstanceId({
	serviceName,
	host,
	port,
}: ServiceEndpoint): string {
	return createHmac(CryptoAlg.SHA256, generateRandomStr())
		.update(`${serviceName}-${host}:${port}-${Date.now()}`)
		.digest("base64");
}

export function verifyInstanceName(serviceName: ServiceInstanceName): boolean {
	return (Object.values(ServiceInstanceName) as readonly string[]).includes(
		InstanceId.of(serviceName)
	);
}
