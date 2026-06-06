import { ServiceInstanceName } from '@trading-model/common/config/services.types';

/** Payload sent when subscribing to a topic. */
export type SubscribesTopicsPayload = {
  topic: string;
  callbackPath: string;
  consumerIdentity: {
    serviceName: ServiceInstanceName;
    instanceId: string;
  };
};

/** Payload sent when unsubscribing from a topic. */
export type UnSubscribesTopicsPayload = {
  topic: string;
  instanceId: string;
};
