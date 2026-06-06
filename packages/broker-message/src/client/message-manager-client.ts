import { MessageManagerError, ServiceUnreachableError } from '@trading-model/common/utils/errors';
import { SubscribesTopicsPayload, UnSubscribesTopicsPayload } from '../shared/types/payloads';
import { ServiceInstanceName } from '@trading-model/common/config/services.types';
import { EventEnumMap } from '@trading-model/common/config/event.types';
import { HttpClient } from '@trading-model/common/config/http-client';
import addressManagerClient from '@trading-model/address-manager';
import { MessageManagerConfig } from '../shared/types/config';
import { MessageMetadata } from '../shared/types/message';

/** Client for interacting with the Message Delivery Service via HTTP. */
export class MessageManagerClient {
  /**
   */
  constructor(
    private readonly httpClient: HttpClient,
    private readonly config: MessageManagerConfig,
    private readonly addressManagerClient: addressManagerClient
  ) {}

  /** Subscribes to a single topic via the Message Delivery Service. */
  private async SubscribesToASingleTopic(topic: EventEnumMap, targetUrl: string): Promise<void> {
    const payload: SubscribesTopicsPayload = {
      callbackPath: this.config.callbackPath,
      consumerIdentity: {
        instanceId: this.config.instanceId,
        serviceName: this.config.serviceName,
      },
      topic,
    };

    try {
      return await this.httpClient.post(targetUrl, payload);
    } catch (error) {
      throw new MessageManagerError('Failed to subscribe topic to Message Manager', error);
    }
  }

  /** Unsubscribes from a single topic via the Message Delivery Service. */
  private async UnSubscribesToASingleTopic(topic: EventEnumMap, targetUrl: string): Promise<void> {
    const payload: UnSubscribesTopicsPayload = {
      instanceId: this.config.instanceId,
      topic,
    };

    try {
      return await this.httpClient.delete(targetUrl, payload);
    } catch (error) {
      throw new MessageManagerError('Failed to unsubscribe topic to Message Manager', error);
    }
  }

  /**
   * Subscribes to the given event topics.
   *
   * @param topics - The topics to subscribe to
   */
  async SubscribeToTopics(topics: EventEnumMap[]): Promise<void> {
    try {
      const target = await this.addressManagerClient.findService(
        ServiceInstanceName.MessageDeliveryService
      );
      if (!target) throw new ServiceUnreachableError('Unable to contact the message manager');

      for (const topic of topics) {
        await this.SubscribesToASingleTopic(topic, `https://${target.ip}:${target.port}/subscribe`);
      }
    } catch (e) {
      if (e instanceof ServiceUnreachableError) throw e;
      if (e instanceof MessageManagerError) return;

      throw new MessageManagerError('Failed to subscribe topic to Message Manager', e);
    }
  }

  /**
   * Unsubscribes from the given event topics.
   *
   * @param topics - The topics to unsubscribe from
   */
  async UnSubscribeToTopic(topics: EventEnumMap[]): Promise<void> {
    try {
      const target = await this.addressManagerClient.findService(
        ServiceInstanceName.MessageDeliveryService
      );
      if (!target) throw new ServiceUnreachableError('Unable to contact the message manager');

      for (const topic of topics) {
        await this.UnSubscribesToASingleTopic(
          topic,
          `https://${target.ip}:${target.port}/subscribe`
        );
      }
    } catch (e) {
      if (e instanceof ServiceUnreachableError) throw e;
      if (e instanceof MessageManagerError) return;

      throw new MessageManagerError('Failed to unsubscribe topic to Message Manager', e);
    }
  }

  /**
   * Publishes a message to the broker for asynchronous delivery.
   *
   * @param payload - The message payload
   * @param metadata - Routing and delivery metadata
   */
  async publishAsyncMessage<T = unknown>(payload: T, metadata: MessageMetadata): Promise<void> {
    try {
      const target = await this.addressManagerClient.findService(
        ServiceInstanceName.MessageDeliveryService
      );
      if (!target) throw new ServiceUnreachableError('Unable to contact the message manager');

      const Messagepayload = {
        payload,
        metadata,
      };

      return await this.httpClient.post(
        `https://${target.ip}:${target.port}/message`,
        Messagepayload
      );
    } catch (error) {
      if (error instanceof ServiceUnreachableError) throw error;

      throw new MessageManagerError('Failed to publish message to Message Manager', error);
    }
  }

  /**
   * Sends a message directly to a specific service.
   *
   * @param service - The target service to receive the message
   * @param payload - The message payload
   * @param metadata - Routing and delivery metadata
   */
  async publishDirectMessage<T = unknown>(
    service: ServiceInstanceName,
    payload: T,
    metadata: MessageMetadata
  ): Promise<void> {
    try {
      const target = await this.addressManagerClient.findService(service);
      if (!target) throw new ServiceUnreachableError('Unable to contact the service: ' + service);

      const Messagepayload = {
        payload,
        metadata,
      };

      return await this.httpClient.post(
        `https://${target.ip}:${target.port}/message`,
        Messagepayload
      );
    } catch (error) {
      if (error instanceof ServiceUnreachableError) throw error;

      throw new MessageManagerError('Failed to publish message to ' + service, error);
    }
  }
}
