import type {
	IPAddress,
	ServiceId,
} from "@trading-model/primitives/primitives";
import AddressManager from "./address-manager";
import type { AddressManagerEnv } from "./config/address-manager-env";

export type { AddressManagerEnv };

/** Creates an AddressManager from the environment. */
export function createAddressManager(env: AddressManagerEnv) {
	// as unknown as: env var is a JSON string parsed upstream into this map
	return new AddressManager({
		dnsNameMap: env.DNS_NAME_MAP as unknown as
			| Record<ServiceId, IPAddress>
			| undefined,
	});
}
