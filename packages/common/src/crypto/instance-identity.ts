import { createHmac } from "node:crypto";
import { ServiceInstanceName } from "../config/services.types";
import type { InstanceId } from "../domain/primitives";
import type { ServiceEndpoint } from "../domain/service-identity";
import { generateRandomStr } from "./random";

export function generateInstanceId({
	serviceName,
	host,
	port,
}: ServiceEndpoint): string {
	return createHmac("sha256", generateRandomStr())
		.update(`${serviceName}-${host}:${port}-${Date.now()}`)
		.digest("base64");
}

export function verifyInstanceName(serviceName: string): boolean {
	return (Object.values(ServiceInstanceName) as readonly string[]).includes(
		serviceName as InstanceId
	);
}
