import type {
	ServiceId,
	URLString,
} from "@trading-model/common/domain/primitives";
import { FIND_A_SERVICE } from "../../config/address-manager";

export async function resolveTarget(
	serviceName: ServiceId,
	callbackURL: string
): Promise<URLString> {
	const address = await FIND_A_SERVICE(serviceName);
	return `https://${address.ip}:${address.port}/${callbackURL}` as URLString;
}
