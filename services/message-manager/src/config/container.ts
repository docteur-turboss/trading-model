/**
 * Initializes the broker system: HTTP client, dispatcher, and Express routes.
 */

import { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import { ServiceId } from "@trading-model/primitives/primitives";
import { ServiceInstanceName } from "@trading-model/primitives/service-instance-name";
import type { Application } from "express";
import { BROKER_ROUTES } from "../adapters/inbound/http.routes";
import { ForwardingDeadLetterStore } from "../adapters/outbound/forwarding-dead-letter-store";
import { HttpDeadLetterStore } from "../adapters/outbound/http-dead-letter-store";
import { HttpMessageDelivery } from "../adapters/outbound/http-message-delivery";
import { InMemoryMessageJournal } from "../adapters/outbound/in-memory-message-journal";
import { InMemorySubscriptionStore } from "../adapters/outbound/in-memory-subscription-store";
import type { DeadLetterStorePort } from "../application/ports/dead-letter-store-port";
import type { MessageJournalPort } from "../application/ports/message-journal-port";
import type { SubscriptionStorePort } from "../application/ports/subscription-store-port";
import { resolveTarget } from "../application/services/address-resolver";
import { DeliveryWorker } from "../application/services/delivery-worker";
import { Dispatcher } from "../application/services/dispatcher";
import { SubscriptionRegistry } from "../application/services/subscription-registry";
import { FileDlqRepository } from "../infrastructure/fallback/dlq-repository";
import type { BrokerConfig } from "../shared/broker.type";

export interface BrokerModule {
	listen: (app: Application) => void;
	/** Starts delivering the journal (every replica runs the worker). */
	startDelivery: () => void;
	/** Stops the worker and waits for the deliveries in flight. */
	stopDelivery: () => Promise<void>;
	/** Sends the dead letters kept in the local file to dlq-service. */
	forwardDeadLetters: () => Promise<void>;
}

export interface DeadLetterSettings {
	/** File the dead letters are kept in while dlq-service cannot take them. */
	filePath?: string;
	/** `DLQ_AUTH_HMAC_SECRET`; without it dead letters only go to the file. */
	dlqSecret?: string;
}

/**
 * @param config - Broker TLS and connection configuration.
 * @param deadLetters - Where dead-lettered messages go.
 * @param subscriptionStore - Shared by the replicas (Redis); the in-memory
 *   default only suits a single replica.
 * @param journal - Durable log of the accepted messages (Redis); the
 *   in-memory default loses them on restart.
 */
export default function createBrokerModule(
	config: BrokerConfig,
	deadLetters: DeadLetterSettings = {},
	subscriptionStore: SubscriptionStorePort = new InMemorySubscriptionStore(),
	journal: MessageJournalPort = new InMemoryMessageJournal()
): BrokerModule {
	const httpClient = HttpClient.createWithTls(config);
	const file = new FileDlqRepository(deadLetters.filePath);
	const forwarding = deadLetters.dlqSecret
		? new ForwardingDeadLetterStore(
				new HttpDeadLetterStore({
					httpClient,
					resolveUrl: () =>
						resolveTarget(ServiceId.of(ServiceInstanceName.DlqService), "dlq"),
					secret: deadLetters.dlqSecret,
				}),
				file
			)
		: undefined;
	const deadLetterStore: DeadLetterStorePort = forwarding ?? file;
	const deliveryPort = new HttpMessageDelivery(httpClient, deadLetterStore);
	const registry = new SubscriptionRegistry(subscriptionStore, journal);
	const dispatcher = new Dispatcher({ registry, journal });
	const worker = new DeliveryWorker({ journal, registry, deliveryPort });
	return {
		listen: (app) => app.use(BROKER_ROUTES(dispatcher)),
		startDelivery: () => worker.start(),
		stopDelivery: () => worker.stop(),
		forwardDeadLetters: async () => {
			await forwarding?.forwardPending();
		},
	};
}
