import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { URLString } from "@trading-model/primitives/primitives";
import { HostPort } from "@trading-model/primitives/service-identity";
import { FIND_A_SERVICE } from "../../config/address-manager";
import { logger } from "../../config/logger";
import { ENV } from "../../infrastructure/config/env";

export function resolveMessageManagerUrl(): Promise<URLString | null> {
	return ENV.MESSAGE_MANAGER_URL
		? Promise.resolve(URLString.of(ENV.MESSAGE_MANAGER_URL))
		: _resolveViaAddressManager();
}

async function _resolveViaAddressManager(): Promise<URLString | null> {
	try {
		const target = await FIND_A_SERVICE(
			ServiceInstanceName.MessageDeliveryService
		);
		if (target) {
			return URLString.of(`https://${HostPort.toAddress(target)}`);
		}
	} catch {
		logger.warn("DLQ address-manager resolution failed");
	}
	return null;
}
