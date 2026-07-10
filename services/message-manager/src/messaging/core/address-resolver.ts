import type { ServiceId } from "@trading-model/common/domain/primitives";
import { FIND_A_SERVICE } from "../../config/address-manager";

export async function resolveTarget(
	serviceName: ServiceId,
	callbackURL: string
): Promise<string> {
	const address = await FIND_A_SERVICE(serviceName);
	return `https://${address.ip}:${address.port}/${callbackURL}`;
}
