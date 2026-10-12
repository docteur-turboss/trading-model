/**
 * Initializes the broker system: HTTP client, dispatcher, and Express routes.
 */

import { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import type { Application } from "express";
import { HttpMessageDelivery } from "../adapters/outbound/http-message-delivery";
import { FileDlqRepository } from "../infrastructure/fallback/dlq-repository";
import { Dispatcher } from "../messaging/core/dispatcher";
import { BROKER_ROUTES } from "../messaging/transport/http.routes";
import type { BrokerConfig } from "../shared/broker.type";

export interface BrokerModule {
	listen: (app: Application) => void;
}

/** @param config - Broker TLS and connection configuration. */
export default function createBrokerModule(config: BrokerConfig): BrokerModule {
	const httpClient = HttpClient.createWithTls(config);
	const dlqRepository = new FileDlqRepository();
	const deliveryPort = new HttpMessageDelivery(httpClient, dlqRepository);
	const dispatcher = new Dispatcher({ deliveryPort });
	return {
		listen: (app) => app.use(BROKER_ROUTES(dispatcher)),
	};
}
