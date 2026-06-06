import { Application } from 'express';
import { EventManager, Listener } from './client/event-manager-client';
import { CreateCallbackRoute } from './http/messages.routes';
import addressManagerClient from '@trading-model/address-manager';
import { MessageMetadata } from './shared/helper/messages/message';
import { HttpClient } from '@trading-model/common/config/http-client';
import { MessageManagerClient } from './client/message-manager-client';
import {
  EventEnumMap,
  EventMessagesArgs,
  EventMap,
} from '@trading-model/common/config/event.types';
import { ServiceInstanceName } from '@trading-model/common/config/services.types';

/** Central orchestrator for broker message operations. */
export default class {
  private MessageManagerClient: MessageManagerClient;
  private topics: EventEnumMap[] | null = null;
  private event: (() => void)[] = [];
  private callbackPath: string = 'message';
  private httpClient: HttpClient;

  constructor({
    addressManagerClient,
    KeyCertificatPath,
    RootCACertPath,
    CertificatPath,
    callbackPath,
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
    this.callbackPath = callbackPath ? callbackPath : this.callbackPath;

    this.httpClient = new HttpClient({
      ca: RootCACertPath,
      cert: CertificatPath,
      key: KeyCertificatPath,
    });

    this.MessageManagerClient = new MessageManagerClient(
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
    await this.MessageManagerClient.SubscribeToTopics(topics);
    this.topics = topics;
  }

  /** Unsubscribes from all topics and cleans up event listeners. */
  async stopMessageManager(): Promise<void> {
    await this.MessageManagerClient.UnSubscribeToTopic(this.topics ?? []);
    this.event.forEach(killFunction => killFunction());
    this.topics = null;
  }

  /** Registers a listener for a broker message event. */
  on<K extends keyof EventMap>(event: K, listener: Listener<EventMessagesArgs<K>>) {
    this.event.push(EventManager.on(event, listener));
  }

  /** Mounts the callback route on the Express application. */
  listenExpress(app: Application) {
    app.use(CreateCallbackRoute(this.callbackPath));
  }

  /** Publishes messages directly or indirectly to services. */
  post = {
    /** Sends a message directly to a specific target service. */
    direct: <T = Parameters<MessageManagerClient['publishDirectMessage']>[1]>(
      service: Parameters<MessageManagerClient['publishDirectMessage']>[0],
      payload: T,
      metadata: Parameters<MessageManagerClient['publishDirectMessage']>[2]
    ) => {
      return this.MessageManagerClient.publishDirectMessage(service, payload, metadata);
    },
    /** Publishes a message to the broker for asynchronous delivery. */
    indirect: <T = Parameters<MessageManagerClient['publishAsyncMessage']>[0]>(
      payload: T,
      metadata: Parameters<MessageManagerClient['publishAsyncMessage']>[1]
    ) => {
      return this.MessageManagerClient.publishAsyncMessage(payload, metadata);
    },
  };
}

/** Metadata builder utility. */
export const helper = {
  MetadataBuilder: MessageMetadata,
};
