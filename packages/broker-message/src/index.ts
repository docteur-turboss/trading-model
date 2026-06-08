import { Application } from 'express';

import addressManagerClient from '@trading-model/address-manager';
import {
  EventEnumMap,
  EventMessagesArgs,
  EventMap,
} from '@trading-model/common/config/event.types';
import { HttpClient } from '@trading-model/common/config/http-client';
import { ServiceInstanceName } from '@trading-model/common/config/services.types';

import { EventManager, Listener } from './client/event-manager-client';
import { MessageManagerClient } from './client/message-manager-client';
import { CreateCallbackRoute } from './http/messages.routes';
import { MessageMetadata } from './shared/helper/messages/message';

/**
 * Central orchestrator for broker message operations.
 *
 * Responsibilities:
 * - Manages an HTTP client for service communication
 * - Coordinates topic subscriptions and unsubscriptions
 * - Publishes messages directly or via the message broker
 * - Manages event listeners for incoming messages
 * - Mounts Express callback routes for message delivery
 */
export default class BrokerMessage {
  private messageManagerClient: MessageManagerClient;
  private topics: EventEnumMap[] | null = null;
  private cleanupFns: (() => void)[] = [];
  private callbackPath: string = 'message';
  private httpClient: HttpClient;

  constructor({
    addressManagerClient,
    KeyCertificatPath,
    RootCACertPath,
    CertificatPath,
    callbackPath: userCallbackPath,
    instanceId,
    serviceName,
  }: {
    instanceId: string;
    callbackPath?: string;
    RootCACertPath: string;
    CertificatPath: string;
    KeyCertificatPath: string;
    addressManagerClient: addressManagerClient;
    serviceName: ServiceInstanceName;
  }) {
    if (userCallbackPath) this.callbackPath = userCallbackPath;

    this.httpClient = HttpClient.createWithTls({
      RootCACertPath,
      CertificatPath,
      KeyCertificatPath,
    });

    this.messageManagerClient = new MessageManagerClient(
      this.httpClient,
      {
        callbackPath: this.callbackPath,
        instanceId,
        serviceName,
      },
      addressManagerClient
    );
  }

  /** Subscribes to the specified event topics. */
  async intents(topics: Parameters<MessageManagerClient['SubscribeToTopics']>[0]): Promise<void> {
    await this.messageManagerClient.SubscribeToTopics(topics);
    this.topics = topics;
  }

  /** Unsubscribes from all topics and cleans up event listeners. */
  async stopMessageManager(): Promise<void> {
    await this.messageManagerClient.UnSubscribeToTopic(this.topics ?? []);
    this.cleanupFns.forEach(fn => fn());
    this.topics = null;
  }

  /** Registers a listener for a broker message event. */
  on<K extends keyof EventMap>(eventName: K, listener: Listener<EventMessagesArgs<K>>) {
    this.cleanupFns.push(EventManager.on(eventName, listener));
  }

  /** Mounts the callback route on the Express application. */
  listenExpress(app: Application) {
    app.use(CreateCallbackRoute(this.callbackPath));
  }

  /** Publishes messages directly or indirectly to services. */
  get post() {
    return {
      direct: <T = Parameters<MessageManagerClient['publishDirectMessage']>[1]>(
        service: Parameters<MessageManagerClient['publishDirectMessage']>[0],
        payload: T,
        metadata: Parameters<MessageManagerClient['publishDirectMessage']>[2]
      ) => {
        return this.messageManagerClient.publishDirectMessage(service, payload, metadata);
      },
      indirect: <T = Parameters<MessageManagerClient['publishAsyncMessage']>[0]>(
        payload: T,
        metadata: Parameters<MessageManagerClient['publishAsyncMessage']>[1]
      ) => {
        return this.messageManagerClient.publishAsyncMessage(payload, metadata);
      },
    };
  }
}

/** Metadata builder utility. */
export const helper = {
  MetadataBuilder: MessageMetadata,
};
