import { createServiceMessageManager } from "@trading-model/broker-message/create-message-manager";
import { ENV } from "../infrastructure/config/env";
import { AddressManager } from "./address-manager";

export const {
	messageManager: MessageManager,
	messageManagerListenExpress: MessageManagerListenExpress,
} = createServiceMessageManager(AddressManager, ENV);
