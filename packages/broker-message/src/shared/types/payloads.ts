import { ServiceInstanceName } from '@trading-model/common/config/services.types';

export type SubscribesTopicsPayload = {
  topic: string;
  callbackPath: string;
  consumerIdentity: {
    serviceName: keyof typeof ServiceInstanceName;
    instanceId: string;
  };
};

export type UnSubscribesTopicsPayload = {
  topic: string;
  instanceId: string;
};
