/**
 * @file broker.ts
 *
 * @description
 * Core Broker facade responsible for publishing messages and managing subscriptions.
 *
 * This class acts as a thin orchestration layer on top of a `Dispatcher`
 * instance. It does not implement delivery logic itself and does not
 * persist or transform messages beyond metadata enrichment.
 *
 * @responsability
 * - Publish messages to the dispatcher
 * - Enrich messages with technical metadata (id, timestamp)
 * - Register and unregister subscriptions
 *
 * @restrictions
 * - Must not implement message delivery logic
 * - Must not perform message persistence
 * - Must not mutate messages after dispatch
 *
 * @architecture
 * Application / messaging layer.
 * This class exposes the public API of the messaging system and delegates
 * all delivery responsibilities to the dispatcher.
 *
 * @author docteur-turboss
 *
 * @version 1.0.0
 *
 * @since 2026.01.28
 */

import { uuid } from "zod";
import { Dispatcher } from "./dispatcher";
import { IdentifyType } from "../broker.type";
import { message, MessageMetadata } from "./message";

/**
 * Messaging broker facade.
 *
 * @description
 * Provides a simple API to publish messages and manage topic subscriptions.
 * Internally delegates all delivery and routing logic to the Dispatcher.
 */
export class Broker {
  /**
   * Creates a Broker instance.
   *
   * @description
   * The broker requires a dispatcher instance to operate.
   * The dispatcher controls subscription management and message delivery.
   *
   * @param dispatcher – Dispatcher responsible for routing and delivery.
   *
   * @lifecycle
   * Instantiated during application bootstrap.
   */
  constructor(
    private readonly dispatcher: Dispatcher
  ) {}

  /**
   * Publish a message to the broker.
   *
   * @description
   * Creates a message envelope by combining the provided payload
   * with technical metadata, then forwards it to the dispatcher.
   *
   * The broker automatically:
   * - Generates a unique message identifier
   * - Sets the emission timestamp
   *
   * @param payload – Message payload.
   * @param metadata – Message metadata excluding technical fields.
   *
   * @returns {Promise<void>}
   *
   * @lifecycle
   * Can be called at any time after broker instantiation.
   */
  async publish(payload: unknown, metadata: Omit<MessageMetadata, "emittedAt"|"messageId">) {
    const Message: message = {
      metadata: {
        ...metadata,
        emittedAt: new Date(),
        messageId: String(uuid()),
      },
      payload
    }

    await this.dispatcher.dispatch(Message);
  }

  /**
   * Register a subscription to a topic.
   *
   * @description
   * Registers a consumer endpoint for a given topic.
   * The actual delivery mechanics are handled by the dispatcher.
   *
   * @param params
   * @param params.topic Topic name to subscribe to.
   * @param params.callbackPath Relative HTTP callback path.
   * @param params.consumerIdentity Identity of the subscribing service instance.
   */
  subscribe(params: {
    topic: string;
    callbackPath: string; 
    consumerIdentity: IdentifyType;
  }) {
    this.dispatcher.registerSubscription(params);
  }

    /**
   * Unregister a subscription from a topic.
   *
   * @description
   * Removes a previously registered subscription based on
   * topic and service instance identifier.
   *
   * @param params
   * @param params.topic Topic name.
   * @param params.instanceId Unique service instance identifier.
   */
  unsubscribe(params: {
    topic: string;
    instanceId: string;
  }) {
    this.dispatcher.unregisterSubscription(params)
  }
}