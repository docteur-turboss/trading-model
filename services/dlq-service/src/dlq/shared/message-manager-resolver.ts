import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { FIND_A_SERVICE } from "../../config/address-manager";
import { ENV } from "../../config/env";
import { logger } from "../../config/logger";

export async function resolveMessageManagerUrl(): Promise<string | null> {
	let url: string | null = ENV.MESSAGE_MANAGER_URL ?? null;
	if (!url) {
		url = await _resolveViaAddressManager();
	}
	return url;
}

async function _resolveViaAddressManager(): Promise<string | null> {
	try {
		const target = await FIND_A_SERVICE(
			ServiceInstanceName.MessageDeliveryService
		);
		if (target) {
			return `https://${target.ip}:${target.port}`;
		}
	} catch {
		logger.warn("DLQ address-manager resolution failed");
	}
	return null;
}
