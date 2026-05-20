export interface SubscribesTopicsPayload {
  topics: string[];
  callbackUrl: string;
}

export interface UnSubscribesTopicsPayload {
  topics: string[];
}

export interface BrokerConfig {
  serviceName: string;
  callbackPath: string;
  instanceId: string;
}
