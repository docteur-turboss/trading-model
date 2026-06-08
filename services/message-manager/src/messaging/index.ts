/**
 * @file index.ts
 *
 * @description
 * This module initializes the **broker system** with TLS configuration, message dispatcher,
 * and exposes the HTTP routes for publishing and subscribing messages.
 *
 * @responsability
 * - Instantiate the Broker core with a Dispatcher
 * - Configure TLS HTTP client for internal message delivery
 * - Expose Express routes for message publication and subscription management
 *
 * @restrictions
 * - This module does not handle business logic of messages
 * - TLS paths must point to valid certificate files
 * - Only one instance of Broker should be created per process
 *
 * @architecture
 * Acts as the **entry point for the broker service**.
 * Composition:
 * - `HttpClient` → handles secure HTTP communication
 * - `Dispatcher` → manages subscriptions and message delivery
 * - `Broker` → exposes publish/subscribe API
 * - `BrokerRoutes` → maps HTTP endpoints to broker actions
 */
import { Application } from 'express';

import { HttpClient } from '@trading-model/common/config/http-client';

import { BrokerConfig } from './broker.type';
import { Dispatcher } from './core/dispatcher';
import { DqlRepository } from './core/dlq-repository';
import { BrokerRoutes } from './transport/http.routes';

/**
 * BrokerModule
 *
 * @description
 * Encapsulates the broker system initialization.
 * Instantiates the HTTP client and dispatcher,
 * and exposes an Express listener to attach broker routes.
 */
export default class BrokerModule {
  /** Dispatcher managing subscriptions and message delivery */
  private dispatcher: Dispatcher;

  /** HTTP client for internal broker communication */
  private httpClient: HttpClient;

  /** Method to attach broker routes to an Express app */
  public listen: (app: Application) => void;

  /**
   * @param config - Broker TLS and connection configuration.
   */
  constructor(config: BrokerConfig) {
    this.httpClient = HttpClient.createWithTls(config);

    const dqlRepository = new DqlRepository();
    this.dispatcher = new Dispatcher(this.httpClient, dqlRepository);

    this.listen = app => app.use(BrokerRoutes(this.dispatcher));
  }
}
