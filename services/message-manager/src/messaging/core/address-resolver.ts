import type {
	ServiceId,
	URLString,
} from "@trading-model/common/domain/primitives";
import { HostPort } from "@trading-model/common/domain/service-identity";
import { FIND_A_SERVICE } from "../../config/address-manager";

export async function resolveTarget(
	serviceName: ServiceId,
	callbackPath: string
): Promise<URLString> {
	const address = await FIND_A_SERVICE(serviceName);
	return `https://${HostPort.toAddress(address)}/${callbackPath}` as URLString;
}
