import { ServiceInstanceName } from "config/services.types";

export type MessageManagerConfig = {
    serviceName: keyof typeof ServiceInstanceName;
    callbackPath: string;
    instanceId: string;
}