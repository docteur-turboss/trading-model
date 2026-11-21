import { createServiceMessageManager } from "@trading-model/broker-message/create-message-manager";
import { ENV } from "../infrastructure/config/env";

export const { messageManager: MessageManager } =
	createServiceMessageManager(ENV);
