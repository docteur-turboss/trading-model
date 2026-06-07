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
 */

import { randomUUID } from 'node:crypto';

import { HttpClient } from '@trading-model/common/config/http-client';
import { logger } from '@trading-model/common/config/logger';
import {
  IdentifyType,
  Message,
  MessageMetadata,
} from '@trading-model/common/contracts/message.types';

import { DqlRepository } from './dlq-repository';
import { Subscription } from './subscription';

/**
 * Message dispatcher.
 *
 * @description
 * Coordinates message delivery between published messages
 * and registered subscriptions. Serves as the single entry
 * point for publish, subscribe, and unsubscribe operations.
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
  constructor(
    private HTTPCLIENT: HttpClient,
    private readonly dlqRepository: DqlRepository
  ) {}

  /**
   * Publish a message to subscribers.
   *
   * @description
   * Creates a message envelope with unique identifier and timestamp,
   * then dispatches it to all matching subscribers.
   *
   * @param payload - Message payload.
   * @param metadata - Message metadata excluding technical fields.
   */
  async publish(payload: unknown, metadata: Omit<MessageMetadata, 'emittedAt' | 'messageId'>) {
    const Msg: Message = {
      metadata: {
        ...metadata,
        emittedAt: new Date(),
        messageId: randomUUID(),
      },
      payload,
    };

    await this.dispatch(Msg);
  }

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
  subscribe(params: { topic: string; callbackPath: string; consumerIdentity: IdentifyType }): void {
    const { topic, consumerIdentity, callbackPath } = params;

    const current = this.subscriptionsByTopic.get(topic) ?? [];

    if (current.some(s => s.serviceIdentity.instanceId === consumerIdentity.instanceId)) return;

    const subscription = new Subscription(
      topic,
      callbackPath,
      consumerIdentity,
      this.dlqRepository
    );

    this.subscriptionsByTopic.set(topic, [...current, subscription]);
  }

  /**
   * Dispatch a message to all subscribers of its topic.
   *
   * @description
   * Resolves all subscriptions matching the message topic
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
  async dispatch<T>(message: Message<T>) {
    const { topic } = message.metadata;
    const subscriptions = this.subscriptionsByTopic.get(topic);
    if (!subscriptions?.length) return;

    const results = await Promise.allSettled(
      subscriptions.map(subscription => subscription.dispatch(this.HTTPCLIENT, message))
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        logger.error('[Dispatcher] Message delivery failed:', { error: result.reason });
      }
    }
  }

  /**
   * @deprecated Use `subscribe` instead.
   */
  registerSubscription(params: {
    topic: string;
    callbackPath: string;
    consumerIdentity: IdentifyType;
  }): void {
    this.subscribe(params);
  }

  /**
   * @deprecated Use `unsubscribe` instead.
   */
  unregisterSubscription(params: { topic: string; instanceId: string }): void {
    this.unsubscribe(params);
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
  unsubscribe(params: { topic: string; instanceId: string }): void {
    const { topic, instanceId } = params;

    const current = this.subscriptionsByTopic.get(topic);
    if (!current) return;

    const remaining = current.filter(s => s.serviceIdentity.instanceId !== instanceId);

    if (remaining.length === 0) this.subscriptionsByTopic.delete(topic);
    this.subscriptionsByTopic.set(topic, remaining);
  }
}
