/**
 * Initializes the broker system: HTTP client, dispatcher, and Express routes.
 */

import { HttpClient } from "@trading-model/common/config/http-client";
import type { Application } from "express";
import { FileDlqRepository } from "../adapters/outbound/dlq-repository";
import { Dispatcher } from "../messaging/core/dispatcher";
import { BROKER_ROUTES } from "../messaging/transport/http.routes";
import type { BrokerConfig } from "../shared/broker.type";

export interface BrokerModule {
	listen: (app: Application) => void;
}

/** @param config - Broker TLS and connection configuration. */
export default function createBrokerModule(config: BrokerConfig): BrokerModule {
	const httpClient = HttpClient.createWithTls(config);
	const dqlRepository = new FileDlqRepository();
	const dispatcher = new Dispatcher(httpClient, dqlRepository);
	return {
		listen: (app) => app.use(BROKER_ROUTES(dispatcher)),
	};
}
