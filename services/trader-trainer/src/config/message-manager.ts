import { createServiceMessageManager } from "@trading-model/broker-message/application/services/create-message-manager";
import { ENV } from "../infrastructure/config/env";
import { AddressManager } from "./address-manager";

export const {
	messageManager: MessageManager,
	messageManagerListenExpress: MessageManagerListenExpress,
} = createServiceMessageManager(AddressManager, ENV);
