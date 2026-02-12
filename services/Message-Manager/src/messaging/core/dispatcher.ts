/**
 * @file dispatcher.ts
 *
 * @description
 * Message dispatch coordinator.
 *
 * This module maintains an in-memory registry of subscriptions per topic
 * and is responsible for dispatching published messages to all matching
 * subscribers.
 *
 * It performs:
 * - Subscription registration and removal
 * - Deduplication of subscriptions per service instance
 * - Parallel message dispatching
 *
 * @responsability
 * - Maintain the subscription registry
 * - Route messages to subscriptions based on topic
 * - Prevent duplicate deliveries to the same service instance
 *
 * @restrictions
 * - Subscriptions are stored in memory only
 * - No persistence or recovery mechanism is implemented
 * - No retry, backoff or delivery guarantee is enforced here
 * - Thread-safety relies on the single-threaded Node.js runtime
 *
 * @architecture
 * Messaging / application layer component.
 * This class acts as an in-memory dispatcher and delegates
 * actual delivery to `Subscription` instances.
 *
 * @author docteur-turboss
 *
 * @version
 * 1.0.0
 *
 * @since
 * 2026.01.28
 */

import { message } from "./message";
import { Subscription } from "./subscription";
import { IdentifyType } from "../broker.type";
import { HttpClient } from "cash-lib/config/httpClient";

/**
 * Message dispatcher.
 *
 * @description
 * Coordinates message delivery between published messages
 * and registered subscriptions.
 */
export class Dispatcher {
  /**
   * In-memory mapping of topics to subscriptions.
   */
  private subscriptionsByTopic = new Map<string, ReadonlyArray<Subscription>>();
  
  /**
   * Creates a Dispatcher instance.
   *
   * @description
   * Requires an HTTP client used by subscriptions to
   * deliver messages to consumer services.
   *
   * @param HTTPCLIENT
   * HTTP client used for outbound message delivery.
   *
   * @lifecycle
   * Instantiated during application bootstrap.
   */
  constructor(private HTTPCLIENT: HttpClient) {}

  /**
   * Register a subscription for a topic.
   *
   * @description
   * Registers a new subscription if no existing subscription
   * for the same service instance already exists.
   *
   * Subscriptions are uniquely identified by:
   * - topic
   * - consumer service instance id
   *
   * @param params
   * Subscription registration parameters.
   */
  registerSubscription(params: {
    topic: string;
    callbackPath: string;
    consumerIdentity: IdentifyType;
  }): void {
    const { topic, consumerIdentity, callbackPath } = params;

    const current = this.subscriptionsByTopic.get(topic) ?? [];

    if (current.some(
      s => s.serviceIdentity.instanceId === consumerIdentity.instanceId,
    )) return;

    const subscription = new Subscription(
      topic, 
      callbackPath, 
      consumerIdentity
    );

    this.subscriptionsByTopic.set(topic, 
      [...current, subscription]
    );
  }

  /**
   * Dispatch a message to all subscribers of its topic.
   *
   * @description
   * Resolves all subscriptions matching the message topic,
   * deduplicates them by service instance identifier,
   * and dispatches the message to each subscription in parallel.
   *
   * Message delivery failures are isolated and do not prevent
   * dispatching to other subscribers.
   *
   * @param message
   * Message to dispatch.
   *
   * @returns {Promise<void>}
   */
  async dispatch<T>(message: message<T>) { //here
    const { topic } = message.metadata;
    const subscriptions = this.subscriptionsByTopic.get(topic);
    if (!subscriptions?.length) return;

    const uniqueSubscriptionsByInstance = new Map<
      string,
      Subscription
    >();

    for (const subscription of subscriptions) {
      uniqueSubscriptionsByInstance.set(
        subscription.serviceIdentity.instanceId,
        subscription,
      );
    }

    const uniqueSubscriptions = [
      ...uniqueSubscriptionsByInstance.values(),
    ];

    await Promise.allSettled(
      uniqueSubscriptions.map(subscription =>
        subscription.dispatch(this.HTTPCLIENT, message),
      )
    );
  }

  /**
   * Unregister a subscription from a topic.
   *
   * @description
   * Removes a subscription associated with a given service
   * instance from the topic registry.
   *
   * @param params
   * Unsubscription parameters.
   */
  unregisterSubscription(params: {
    topic: string;
    instanceId: string;
  }): void {
    const { topic, instanceId } = params;
    
    const current = this.subscriptionsByTopic.get(topic);
    if(!current) return;

    const remaining = current.filter(
      s => s.serviceIdentity.instanceId !== instanceId
    );

    if(remaining.length === 0) this.subscriptionsByTopic.delete(topic);
    this.subscriptionsByTopic.set(topic, remaining);
  }
}