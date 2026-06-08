import addressManagerClient from '@trading-model/address-manager';
import { EventEnumMap } from '@trading-model/common/config/event.types';
import { HttpClient } from '@trading-model/common/config/http-client';
import { ServiceInstanceName } from '@trading-model/common/config/services.types';
import { MessageMetadata } from '@trading-model/common/contracts/message.types';
import { AppError, ErrorCodes, normalizeError } from '@trading-model/common/utils/errors';

import { MessageManagerConfig } from '../shared/types/config';
import { SubscribesTopicsPayload, UnSubscribesTopicsPayload } from '../shared/types/payloads';

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
      throw new AppError(
        'Failed to subscribe topic to Message Manager',
        ErrorCodes.MESSAGE_MANAGER_ERROR,
        { cause: normalizeError(error) }
      );
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
      throw new AppError(
        'Failed to unsubscribe topic to Message Manager',
        ErrorCodes.MESSAGE_MANAGER_ERROR,
        { cause: normalizeError(error) }
      );
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
      if (!target)
        throw new AppError('Unable to contact the message manager', ErrorCodes.SERVICE_UNREACHABLE);

      for (const topic of topics) {
        await this.SubscribesToASingleTopic(topic, `https://${target.ip}:${target.port}/subscribe`);
      }
    } catch (e) {
      if (e instanceof AppError && e.code === ErrorCodes.SERVICE_UNREACHABLE) throw e;
      if (e instanceof AppError && e.code === ErrorCodes.MESSAGE_MANAGER_ERROR) return;

      throw new AppError(
        'Failed to subscribe topic to Message Manager',
        ErrorCodes.MESSAGE_MANAGER_ERROR,
        { cause: normalizeError(e) }
      );
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
      if (!target)
        throw new AppError('Unable to contact the message manager', ErrorCodes.SERVICE_UNREACHABLE);

      for (const topic of topics) {
        await this.UnSubscribesToASingleTopic(
          topic,
          `https://${target.ip}:${target.port}/subscribe`
        );
      }
    } catch (e) {
      if (e instanceof AppError && e.code === ErrorCodes.SERVICE_UNREACHABLE) throw e;
      if (e instanceof AppError && e.code === ErrorCodes.MESSAGE_MANAGER_ERROR) return;

      throw new AppError(
        'Failed to unsubscribe topic to Message Manager',
        ErrorCodes.MESSAGE_MANAGER_ERROR,
        { cause: normalizeError(e) }
      );
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
      if (!target)
        throw new AppError('Unable to contact the message manager', ErrorCodes.SERVICE_UNREACHABLE);

      const Messagepayload = {
        payload,
        metadata,
      };

      return await this.httpClient.post(
        `https://${target.ip}:${target.port}/message`,
        Messagepayload
      );
    } catch (error) {
      if (error instanceof AppError && error.code === ErrorCodes.SERVICE_UNREACHABLE) throw error;

      throw new AppError(
        'Failed to publish message to Message Manager',
        ErrorCodes.MESSAGE_MANAGER_ERROR,
        { cause: normalizeError(error) }
      );
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
      if (!target)
        throw new AppError(
          'Unable to contact the service: ' + service,
          ErrorCodes.SERVICE_UNREACHABLE
        );

      const Messagepayload = {
        payload,
        metadata,
      };

      return await this.httpClient.post(
        `https://${target.ip}:${target.port}/message`,
        Messagepayload
      );
    } catch (error) {
      if (error instanceof AppError && error.code === ErrorCodes.SERVICE_UNREACHABLE) throw error;

      throw new AppError(
        'Failed to publish message to ' + service,
        ErrorCodes.MESSAGE_MANAGER_ERROR,
        { cause: normalizeError(error) }
      );
    }
  }
}
