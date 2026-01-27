import { findAService } from "config/address-manager";
import { IdentifyType } from "../broker.interface";
import { DeliveryMode } from "../broker.constants";
import httpClient from "shared/utils/httpClient";
import { message } from "./message";

/**
 * TODO
 */
export type MessageHandler<T = unknown> = (
    message: message<T>,
) => Promise<unknown>;

export class Subscription {
  constructor(
    public readonly topic: string,
    public readonly callbackURL: string,
    public readonly serviceIdentity: IdentifyType,
  ) {};

  async sendMessage (message: unknown, options?: Partial<message>): Promise<unknown> {
    let SubscribersContext : SubscribersContext = {
      receivedAt: null,
      consumerGroup: this.serviceIdentity.serviceName,
      deliveryAttempt: 0
    };


    while(true){
      try {
        const address = await findAService(this.serviceIdentity.serviceName);

        let res = await httpClient.post(`https://${address.ip}:${address.port}/${this.callbackURL}`, message);

        
      } catch (e) {
        SubscribersContext.deliveryAttempt ++;

        if(options && options.metadata && options.metadata.delivery){
          const deliveryOption = options.metadata.delivery
          if((deliveryOption.ttl ?? 0) + new Date(options.metadata.emittedAt ?? 0).getTime() < Date.now()) break;
          

        }
      }
    }
  }
}

export interface SubscribersContext {
  receivedAt: Date | null;                           /* Timestamp when message was delivered   */
  consumerGroup: string;                      /* Consumer group identifier              */
  deliveryAttempt: number;                    /* Current retry attempt number           */
  
  // ack(): Promise<void>;                       /* Confirms successful processing         */
  // nack(reason?: string): Promise<void>;       /* Signals processing failure             */
  // requeue(delayMs?: number): Promise<void>;   /* Requests delayed retry                 */
  // deadLetter(reason?: string): Promise<void>; /* Sends message to DLQ                   */
}