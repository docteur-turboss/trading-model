import { createServiceBusClient } from "@trading-model/broker-message/create-message-manager";
import { ENV } from "../infrastructure/config/env";

export const busClient = createServiceBusClient(ENV);
