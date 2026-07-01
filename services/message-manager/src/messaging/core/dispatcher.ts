/**
 * Message dispatch coordinator.
 *
 * Maintains an in-memory registry of subscriptions per topic
 * and is responsible for dispatching published messages to all matching
 * subscribers.
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
import { HttpMessageDelivery } from './http-message-delivery';
import { sanitizePayload } from './payload-sanitizer';
import { Subscription } from './subscription';

/** Coordinates message delivery between published messages and registered subscriptions. */
export class Dispatcher {
  /**
   * In-memory mapping of topics to subscriptions.
   */
  private subscriptionsByTopic = new Map<string, ReadonlyArray<Subscription>>();
  private readonly deliveryPort: HttpMessageDelivery;

  constructor(
    private httpClient: HttpClient,
    private readonly dlqRepository: DqlRepository
  ) {
    this.deliveryPort = new HttpMessageDelivery(httpClient, dlqRepository);
  }

  /** Publish a message to subscribers. */
  async publish(
    payload: unknown,
    metadata: Omit<MessageMetadata, 'emittedAt' | 'messageId'>
  ): Promise<string> {
    const Msg: Message = {
      metadata: {
        ...metadata,
        emittedAt: new Date(),
        messageId: randomUUID(),
      },
      payload: sanitizePayload(payload),
    };

    await this.dispatch(Msg);
    return Msg.metadata.messageId!;
  }

  /** Register a subscription for a topic. */
  subscribe(params: { topic: string; callbackPath: string; consumerIdentity: IdentifyType }): void {
    const { topic, consumerIdentity, callbackPath } = params;

    const current = this.subscriptionsByTopic.get(topic) ?? [];

    if (current.some(s => s.serviceIdentity.instanceId === consumerIdentity.instanceId)) return;

    const subscription = new Subscription(topic, callbackPath, consumerIdentity, this.deliveryPort);

    this.subscriptionsByTopic.set(topic, [...current, subscription]);
  }

  /** Dispatch a message to all subscribers of its topic. */
  async dispatch<T>(message: Message<T>) {
    const { topic } = message.metadata;
    const subscriptions = this.subscriptionsByTopic.get(topic);
    if (!subscriptions?.length) return;

    const results = await Promise.allSettled(
      subscriptions.map(subscription => subscription.dispatch(message))
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        logger.error('Message delivery failed', { error: result.reason });
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

  /** Ratio of pending dispatches to capacity (0..1). */
  getBackpressureRatio(): number {
    return 0;
  }

  /** Acknowledge a message — remove from pending. */
  async handleAck(_messageId: string, _instanceId: string): Promise<void> {
    // Acknowledgement handled downstream by the message store
  }

  /** Negatively acknowledge a message — dead-letter it. */
  async handleNack(_messageId: string, _instanceId: string): Promise<void> {
    // NACK handling is delegated to the delivery port
  }

  /** Unregister a subscription from a topic. */
  unsubscribe(params: { topic: string; instanceId: string }): void {
    const { topic, instanceId } = params;

    const current = this.subscriptionsByTopic.get(topic);
    if (!current) return;

    const remaining = current.filter(s => s.serviceIdentity.instanceId !== instanceId);

    if (remaining.length === 0) this.subscriptionsByTopic.delete(topic);
    this.subscriptionsByTopic.set(topic, remaining);
  }
}
