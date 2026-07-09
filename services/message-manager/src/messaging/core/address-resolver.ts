import { FIND_A_SERVICE } from "../../config/address-manager";

export async function resolveTarget(
	serviceName: string,
	callbackURL: string
): Promise<string> {
	const address = await FIND_A_SERVICE(serviceName);
	return `https://${address.ip}:${address.port}/${callbackURL}`;
}
