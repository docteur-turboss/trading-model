import { createServiceMessageManager } from "@trading-model/broker-message/shared/helper/create-message-manager";

import { AddressManager } from "./address-manager";
import { ENV } from "./env";

export const {
	messageManager: MessageManager,
	messageManagerListenExpress: MessageManagerListenExpress,
} = createServiceMessageManager(AddressManager, ENV);
