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
 * - `BROKER_ROUTES` → maps HTTP endpoints to broker actions
 */

import { HttpClient } from "@trading-model/common/config/http-client";
import type { Application } from "express";

import type { BrokerConfig } from "./broker.type";
import { Dispatcher } from "./core/dispatcher";
import { DlqRepository } from "./core/dlq-repository";
import { BROKER_ROUTES } from "./transport/http.routes";

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
	private _dispatcher: Dispatcher;

	/** HTTP client for internal broker communication */
	private _httpClient: HttpClient;

	/** Method to attach broker routes to an Express app */
	public listen: (app: Application) => void;

	/**
	 * @param config - Broker TLS and connection configuration.
	 */
	constructor(config: BrokerConfig) {
		this._httpClient = HttpClient.createWithTls(config);

		const dqlRepository = new DlqRepository();
		this._dispatcher = new Dispatcher(this._httpClient, dqlRepository);

		this.listen = (app) => app.use(BROKER_ROUTES(this._dispatcher));
	}
}
