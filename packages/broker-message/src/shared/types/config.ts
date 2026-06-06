import { ServiceInstanceName } from '@trading-model/common/config/services.types';

/** Configuration for the MessageManagerClient. */
export type MessageManagerConfig = {
  serviceName: keyof typeof ServiceInstanceName;
  callbackPath: string;
  instanceId: string;
};
