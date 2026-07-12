import { createHmac } from "node:crypto";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { InstanceId } from "@trading-model/common/domain/primitives";
import type { ServiceEndpoint } from "@trading-model/common/domain/service-identity";
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
