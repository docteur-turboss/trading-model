import type addressManagerClient from "@trading-model/address-manager";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";

import MessageManagerClass from "../../index";

/** Configuration options for creating a MessageManager instance. */
export interface MessageManagerOptions {
	addressManagerClient: addressManagerClient;
	tlsPaths: TlsPaths;
	instanceId: string;
	serviceName: ServiceInstanceName;
	callbackPath: string;
}

/** Creates a MessageManager instance with its bound Express listener.
 *
 * @param options - Configuration options
 * @returns An object containing the MessageManager instance and its Express listener
 */
export function createMessageManager(options: MessageManagerOptions) {
	const ma = new MessageManagerClass({
		addressManagerClient: options.addressManagerClient,
		tlsPaths: options.tlsPaths,
		instanceId: options.instanceId,
		serviceName: options.serviceName,
		callbackPath: options.callbackPath,
	});
	return {
		messageManager: ma,
		messageManagerListenExpress: ma.listenExpress.bind(ma),
	};
}
