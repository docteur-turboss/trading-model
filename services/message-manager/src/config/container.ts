/**
 * Initializes the broker system: HTTP client, dispatcher, and Express routes.
 */

import type { TlsPaths } from "@trading-model/common/config/tls-paths";
import { normalizeError } from "@trading-model/common/utils/errors";
import { getLogger } from "@trading-model/contracts/logger-registry";
import { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import { ServiceId } from "@trading-model/primitives/primitives";
import { ServiceInstanceName } from "@trading-model/primitives/service-instance-name";
import type { Application } from "express";
import { BROKER_ROUTES } from "../adapters/inbound/http.routes";
import { HttpDeadLetterStore } from "../adapters/outbound/http-dead-letter-store";
import { HttpMessageDelivery } from "../adapters/outbound/http-message-delivery";
import { InMemoryMessageJournal } from "../adapters/outbound/in-memory-message-journal";
import { InMemorySubscriptionStore } from "../adapters/outbound/in-memory-subscription-store";
import { resolveTarget } from "../application/services/address-resolver";
import { DeliveryWorker } from "../application/services/delivery-worker";
import { Dispatcher } from "../application/services/dispatcher";
import { SubscriptionRegistry } from "../application/services/subscription-registry";
import type { DeadLetterStorePort } from "../domain/ports/dead-letter-store.port";
import type { MessageJournalPort } from "../domain/ports/message-journal.port";
import type { SubscriptionStorePort } from "../domain/ports/subscription-store.port";
import {
	JOURNAL_OLDEST_PENDING_AGE_SECONDS,
	JOURNAL_PENDING_ENTRIES,
} from "./metrics";

/** Between two reads of the journal backlog: a few Redis calls per group, never per message. */
const LAG_INTERVAL_MS = 15_000;

/** Publishes the backlog of each group; a group that left the journal drops out of the gauges. */
export async function publishJournalLag(
	journal: MessageJournalPort
): Promise<void> {
	if (!journal.lag) {
		return;
	}
	let lags: Awaited<ReturnType<NonNullable<MessageJournalPort["lag"]>>>;
	try {
		lags = await journal.lag();
	} catch (err) {
		// No frozen series on a Redis outage: stale values would hide or fake a backlog.
		JOURNAL_PENDING_ENTRIES.reset();
		JOURNAL_OLDEST_PENDING_AGE_SECONDS.reset();
		throw err;
	}
	JOURNAL_PENDING_ENTRIES.reset();
	JOURNAL_OLDEST_PENDING_AGE_SECONDS.reset();
	for (const { topic, service, pending, oldestPendingAgeMs } of lags) {
		JOURNAL_PENDING_ENTRIES.set({ topic, service }, pending);
		JOURNAL_OLDEST_PENDING_AGE_SECONDS.set(
			{ topic, service },
			oldestPendingAgeMs / 1000
		);
	}
}

export interface BrokerModule {
	listen: (app: Application) => void;
	/** Starts delivering the journal (every replica runs the worker). */
	startDelivery: () => void;
	/** Stops the worker and waits for the deliveries in flight. */
	stopDelivery: () => Promise<void>;
}

export interface DeadLetterSettings {
	/** `DLQ_AUTH_HMAC_SECRET`; without it dead-lettering fails (entries stay in the journal). */
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
	config: TlsPaths,
	deadLetters: DeadLetterSettings = {},
	subscriptionStore: SubscriptionStorePort = new InMemorySubscriptionStore(),
	journal: MessageJournalPort = new InMemoryMessageJournal()
): BrokerModule {
	const httpClient = HttpClient.createWithTls(config);
	const deadLetterStore: DeadLetterStorePort = deadLetters.dlqSecret
		? new HttpDeadLetterStore({
				httpClient,
				resolveUrl: () =>
					resolveTarget(ServiceId.of(ServiceInstanceName.DlqService), "dlq"),
				secret: deadLetters.dlqSecret,
			})
		: {
				insert: () => Promise.reject(new Error("DLQ_AUTH_HMAC_SECRET not set")),
			};
	const deliveryPort = new HttpMessageDelivery(httpClient, deadLetterStore);
	const registry = new SubscriptionRegistry(subscriptionStore, journal);
	const dispatcher = new Dispatcher({ registry, journal });
	const worker = new DeliveryWorker({ journal, registry, deliveryPort });
	let lagTimer: NodeJS.Timeout | undefined;
	return {
		listen: (app) => app.use(BROKER_ROUTES(dispatcher)),
		startDelivery: () => {
			worker.start();
			const measure = () =>
				publishJournalLag(journal).catch((err: unknown) =>
					getLogger().error("Reading the journal backlog failed", {
						error: normalizeError(err),
					})
				);
			void measure();
			lagTimer = setInterval(() => void measure(), LAG_INTERVAL_MS);
			lagTimer.unref();
		},
		stopDelivery: () => {
			clearInterval(lagTimer);
			return worker.stop();
		},
	};
}
