/**
 * @file subscription.ts
 * 
 * @description
 * Implements the subscriber-side delivery mechanism of the message broker.
 * Handles dispatching messages to subscribed services via HTTP callbacks
 * with support for delivery semantics, retries, TTL expiration, and DLQ routing.
 * 
 * @responsability
 * - Dispatch messages to service endpoints subscribed to a topic
 * - Enforce delivery semantics (AT_LEAST_ONCE / AT_MOST_ONCE)
 * - Handle acknowledgements, retries, and TTL expiration
 * - Route failed messages to a Dead Letter Queue (DLQ)
 * 
 * @restrictions
 * - This module acts as a delivery orchestrator and does not process business logic
 * - Message payloads must not be mutated
 * - Messages cannot be persisted or exposed outside delivery context
 * 
 * @architecture
 * Infrastructure / messaging layer component.
 * Acts as a delivery orchestrator for the Broker service.
 * 
 * @author docteur-turboss
 * 
 * @version 1.0.0
 * 
 * @since 2026.01.28
 */
import { DeadLetterError, NackError } from "shared/utils/Error";
import { HttpClient } from "cash-lib/config/httpClient";
import { findAService } from "config/address-manager";
import { IdentifyType } from "../broker.type";
import { DeliveryMode } from "../broker.type";
import { message as Message} from "./message";

/**
 * Runtime context provided to subscribers during message delivery.
 * 
 * @description
 * Exposes delivery metadata and acknowledgement controls to the subscriber,
 * allowing explicit signaling of successful or failed processing.
 *
 * @interface SubscribersContext
 */
export interface SubscribersContext {
  /** Timestamp when the message was successfully delivered; null until acked */
  receivedAt: Date | null;

  /** Logical consumer group identifier used for load balancing and retries */
  consumerGroup: string;

  /** Number of delivery attempts performed */
  deliveryAttempt: number;
  
  /**
   * Acknowledges successful message processing
   * 
   * @returns {Promise<void>}
   */
  ack(): Promise<void>;
  
  /**
   * Signals a recoverable failure and requests a retry
   * 
   * @param {string} [reason] Optional failure reason
   * @throws {NackError}
   */
  nack(reason?: string): Promise<void>;

  /**
   * Signals an unrecoverable failure; message will be routed to DLQ
   * 
   * @param {string} [reason] Optional failure reason
   * @throws {DeadLetterError}
   */
  deadLetter(reason?: string): Promise<void>;
}


/**
 * Represents a subscription binding between a topic and a service endpoint.
 * 
 * @description
 * Manages delivery of messages for a given topic to a specific subscriber.
 * Enforces delivery semantics and TTL expiration, and routes failures to DLQ.
 *
 * @class Subscription
 */
export class Subscription {
  /**
   * @param {string} topic Topic name subscribed to
   * @param {string} callbackURL Relative HTTP endpoint for message delivery
   * @param {IdentifyType} serviceIdentity Identity of the consuming service
   */
  constructor(
    public readonly topic: string,
    public readonly callbackURL: string,
    public readonly serviceIdentity: IdentifyType,
  ) {};

  /**
   * Dispatches a message to the subscribed service.
   * 
   * @description
   * Resolves the target service address, sends the message via HTTP,
   * retries according to delivery semantics, and handles TTL expiration.
   * 
   * Delivery behavior depends on `DeliveryMode`:
   * - `AT_LEAST_ONCE`: retries until ACK or TTL expiry
   * - `AT_MOST_ONCE`: no retry on NACK
   * - `EXACTLY_ONCE`: stops after first delivery
   *
   * @template T Message payload type
   * @param {Message<T>} message Message to dispatch
   * @param {HttpClient} httpClient HTTP client instance
   * @returns {Promise<void>}
   */
  async dispatch<T>(
    httpClient: HttpClient,
    message: Message<T>,
  ): Promise<void> {
    const ttl = message.metadata.delivery?.ttl ?? 0;
    const deliveryMode =
      message.metadata.delivery?.mode ?? DeliveryMode.AT_LEAST_ONCE;

    const emittedAt = new Date(message.metadata.emittedAt ?? 0).getTime();

    let acknowledged = false;

    const context: SubscribersContext = {
      receivedAt: null,
      consumerGroup: this.serviceIdentity.serviceName,
      deliveryAttempt: 0,

      ack: async () => {
        acknowledged = true;
      },

      nack: async (reason?: string) => {
        throw new NackError(reason);
      },

      deadLetter: async (reason?: string) => {
        throw new DeadLetterError(reason);
      }
    }

    while(!acknowledged){
      try {
        const target = await this.resolveTarget();

        await httpClient.post(target, {
          message,
          context: {
            deliveryAttempt: context.deliveryAttempt,
            consumerGroup: context.consumerGroup,
          },
        });

        context.receivedAt = new Date();
        await context.ack();
      } catch (e) {
        context.deliveryAttempt ++;

        if(e instanceof DeadLetterError) {
          await this.sendToDLQ(message, e.reason);
          return;
        }

        if(this.isExpired(ttl, emittedAt)) {
          await this.sendToDLQ(message, "TTL_EXPIRED");
          return;
        }

        if(
          deliveryMode === DeliveryMode.AT_MOST_ONCE &&
          e instanceof NackError
        ) {
          return;
        }

        // retry (AT LEAST ONCE)
        // FUTURE: backof / jitter / circuit breaker;
      }

      if(
        deliveryMode === DeliveryMode.EXACTLY_ONCE || 
        deliveryMode === DeliveryMode.AT_MOST_ONCE
      ) return;
    };
  }

  /**
   * Resolves the HTTPS endpoint for the subscriber service.
   * 
   * @returns {Promise<string>} Fully-qualified target URL
   */
  private async resolveTarget(): Promise<string> {
    const address = await findAService(this.serviceIdentity.serviceName);

    return `https://${address.ip}:${address.port}/${this.callbackURL}`;
  }
  
  /**
   * Determines if a message has exceeded its TTL.
   * 
   * @param {number} ttl TTL in milliseconds
   * @param {number} emittedAt Timestamp when message was emitted
   * @returns {boolean} True if expired, false otherwise
   */
  private isExpired(ttl: number, emittedAt: number): boolean{
    if(ttl <= 0 || emittedAt <= 0) return false;
    return emittedAt + ttl < Date.now();
  }

  /**
   * Routes a message to the Dead Letter Queue (DLQ).
   * 
   * @template T
   * @param {Message<T>} message Failed message
   * @param {string} [reason] Optional failure reason
   * @returns {Promise<void>}
   * @description
   * Placeholder for routing messages to an HTTP endpoint, persistent storage,
   * or event sink.
   */
  private async sendToDLQ<T>(
    message: Message<T>,
    reason?: string,
  ): Promise<void> {
    // PLACEHOLDER: HTTP ENDPOINT, STORAGE, or EVENT SINK
    // Example:
    // await httpClient.post("https://dlq.internal/messages", { message, reason });
  }
}