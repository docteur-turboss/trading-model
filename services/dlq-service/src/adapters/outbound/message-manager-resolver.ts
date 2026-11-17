import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { URLString } from "@trading-model/primitives/primitives";
import { HostPort } from "@trading-model/primitives/service-identity";
import { FIND_A_SERVICE } from "../../config/address-manager";
import { ENV } from "../../infrastructure/config/env";

export function resolveMessageManagerUrl(): Promise<URLString | null> {
	return ENV.MESSAGE_MANAGER_URL
		? Promise.resolve(URLString.of(ENV.MESSAGE_MANAGER_URL))
		: FIND_A_SERVICE(ServiceInstanceName.MessageManagerService).then((target) =>
				URLString.of(`https://${HostPort.toAddress(target)}`)
			);
}
