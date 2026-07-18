/**
 * Initializes the broker system: HTTP client, dispatcher, and Express routes.
 */

import { HttpClient } from "@trading-model/common/config/http-client";
import type { Application } from "express";

import type { BrokerConfig } from "./broker.type";
import { Dispatcher } from "./core/dispatcher";
import { FileDlqRepository } from "./core/dlq-repository";
import { BROKER_ROUTES } from "./transport/http.routes";

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
