import type addressManagerClient from "@trading-model/address-manager";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";

import MessageManagerClass from "../../index";

/** Configuration options for creating a MessageManager instance. */
export interface MessageManagerOptions {
	addressManagerClient: addressManagerClient;
	certPath: string;
	instanceId: string;
	keyPath: string;
	caPath: string;
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
		certPath: options.certPath,
		instanceId: options.instanceId,
		keyPath: options.keyPath,
		caPath: options.caPath,
		serviceName: options.serviceName,
		callbackPath: options.callbackPath,
	});
	return {
		messageManager: ma,
		messageManagerListenExpress: ma.listenExpress.bind(ma),
	};
}
