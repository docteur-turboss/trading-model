import { createMessageManager } from "@trading-model/broker-message/shared/helper/create-message-manager";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";

import { AddressManager } from "./address-manager";
import { env } from "./env";

export const {
	messageManager: MessageManager,
	messageManagerListenExpress: MessageManagerListenExpress,
} = createMessageManager({
	addressManagerClient: AddressManager,
	certPath: env.TLS_CERT_PATH,
	instanceId: env.INSTANCE_ID,
	keyPath: env.TLS_KEY_PATH,
	caPath: env.TLS_CA_PATH,
	serviceName: env.SERVICE_NAME as ServiceInstanceName,
	callbackPath: env.MESSAGE_CALLBACK_PATH,
});
