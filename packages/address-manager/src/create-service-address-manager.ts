import {
	type AddressManagerEnv,
	createAddressManager,
} from "./create-address-manager";

export function createServiceAddressManager(env: AddressManagerEnv) {
	const am = createAddressManager(env);
	return {
		AddressManager: am,
		BOOTSTRAP_ADDRESS_MANAGER: am.start,
		ADDRESS_MANAGER_ROUTES: am.listenExpress,
		FIND_A_SERVICE: am.findService,
	};
}
