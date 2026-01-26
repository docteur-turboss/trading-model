import { ServiceInstanceName } from "cash-lib/config/services.types"
import { message } from "./core/message"
import { SubscribersContext } from "./core/subscription"

/**
 * TODO
 */
export interface BrokerAdapter {
  publish(message: message): Promise<void>

  subscribe(
    topic: string,
    consumerGroup: string,
    onMessage: (
      message: message,
      context: SubscribersContext
    ) => Promise<void>
  ): Promise<void>

  close(): Promise<void>
}

export interface IdentifyType {
  serviceName: keyof typeof ServiceInstanceName; /* Logical name of the emitting service       */
  instanceId: string;                            /* Unique instance identifier (pod/container) */
}