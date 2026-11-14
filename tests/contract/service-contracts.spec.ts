import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { AuditEvent } from "@trading-model/contracts/audit-events";
import { DlqEvent } from "@trading-model/contracts/dlq-events";
import { CandleInterval } from "@trading-model/contracts/market-data.types";
import { MarketEvent } from "@trading-model/contracts/market-events";
import { TrainingEvent } from "@trading-model/contracts/training-events";
import { toSymbol } from "@trading-model/primitives/primitives";
import {
	createRecordingBrokerClient,
	type PublishedRequest,
	relayThroughMessageManager,
} from "./support/broker-pipeline";
import { deadLetterAndReplay } from "./support/dead-letter-replay";
import {
	createAuditSubscriber,
	createTrainerSubscriber,
} from "./support/subscribers";

/**
 * Cross-service message contracts, checked on the real code of both ends.
 *
 * Producers run their actual publishing code (financial-scraper scrape cycle,
 * trader-trainer model publisher) through the real broker client; the request
 * goes through message-manager's real validation, message factory and
 * delivery; the delivered body reaches the subscribers' real inbound adapters
 * (broker-message callback controller + trainer handler, audit-logger
 * `/message`). Only the network and the metrics are stubbed.
 *
 * Dead letters close the loop: message-manager dead-letters each delivered
 * message, dlq-service takes and stores it, and its replay must be accepted
 * by message-manager and reach the subscribers again.
 *
 * Nothing here restates a schema: a contract breaks when one side changes
 * and the other does not, and the topic catalogue below is checked against
 * what the code publishes and subscribes to.
 */

const mockScraperBroker = createRecordingBrokerClient("financial-scraper");
const mockTrainerBroker = createRecordingBrokerClient("trader-trainer");
const mockDlqBroker = createRecordingBrokerClient("dlq-service");

jest.mock(
	"../../services/financial-scraper/src/infrastructure/config/env",
	() => ({
		ENV: {
			SERVICE_NAME: "financial-scraper",
			INSTANCE_ID: "financial-scraper-1",
		},
	})
);
jest.mock(
	"../../services/financial-scraper/src/config/message-manager",
	() => ({
		MessageManager: {
			post: {
				indirect: (payload: unknown, metadata: never) =>
					mockScraperBroker.client.publish(payload, metadata),
			},
		},
	})
);
jest.mock("../../services/financial-scraper/src/config/metrics", () => ({
	EVENTS_PUBLISHED_TOTAL: { inc: () => undefined },
}));
jest.mock("../../services/message-manager/src/config/metrics", () => ({
	MESSAGES_DLQ_TOTAL: { inc: () => undefined },
}));
jest.mock("../../services/audit-logger/src/config/metrics", () => ({
	EVENTS_INGESTED_TOTAL: { inc: () => undefined },
}));
// dlq-service publishes its events through the real broker client.
jest.mock(
	"@trading-model/broker-message/application/services/create-message-manager",
	() => ({
		createServiceMessageManager: () => ({
			messageManager: {
				post: {
					indirect: (payload: unknown, metadata: never) =>
						mockDlqBroker.client.publish(payload, metadata),
				},
			},
		}),
	})
);
jest.mock("../../services/dlq-service/src/infrastructure/config/env", () => ({
	ENV: { INSTANCE_ID: "dlq-service-1" },
}));
jest.mock("../../services/dlq-service/src/config/address-manager", () => ({
	AddressManager: {},
}));

import {
	notifyAddAudit,
	notifyDeleteAudit,
	notifyReplayAudit,
} from "../../services/dlq-service/src/adapters/outbound/audit-notifier";
import { buildResponse } from "../../services/financial-scraper/src/adapters/outbound/binance/binance-data-fetcher";
import {
	buildMarketDataEntries,
	sendAllMarketData,
} from "../../services/financial-scraper/src/adapters/outbound/broker/market-data-sender";
import { createMarketDataMetadata } from "../../services/financial-scraper/src/adapters/outbound/broker/metadata-builder";
import {
	mock24hrTickerResponse,
	mockBookTickerResponse,
	mockCandlestickResponse,
	mockDepthResponse,
	mockPriceTickerResponse,
	mockTradeResponse,
} from "../../services/financial-scraper/tests/fixtures/binance.fixture";
import { ModelPublisher } from "../../services/trader-trainer/src/adapters/outbound/model-publisher";

/**
 * Topics declared in the contracts package that no service publishes yet.
 * Listing one here is a decision, not a default: the catalogue test fails
 * when a topic is neither published nor listed, and when a listed topic
 * starts being published.
 */
const UNPUBLISHED_TOPICS: Record<string, string> = {
	[MarketEvent.TestEvent]: "debug topic, no producer",
	[MarketEvent.ExampleEvent]: "example topic, no producer",
	[AuditEvent.AuditHeartbeat]: "reserved for audit heartbeats, no producer",
	[AuditEvent.AuditGapDetected]: "reserved for audit gap reports, no producer",
};

const ALL_TOPICS: string[] = [
	...Object.values(MarketEvent),
	...Object.values(AuditEvent),
	...Object.values(TrainingEvent),
	...Object.values(DlqEvent),
];

interface Publication {
	producer: string;
	topic: string;
	request: PublishedRequest;
}

function topicOf(request: PublishedRequest): string {
	return (request.body as { metadata: { topic: string } }).metadata.topic;
}

function publicationsOf(
	producer: string,
	requests: PublishedRequest[]
): Publication[] {
	return requests.map((request) => ({
		producer,
		topic: topicOf(request),
		request,
	}));
}

async function publishScrapeCycle(): Promise<Publication[]> {
	const response = buildResponse(
		{ symbol: toSymbol("BTCUSDT"), interval: CandleInterval.Min1 },
		{
			orderBookRaw: mockDepthResponse,
			tradesRaw: mockTradeResponse,
			candlesRaw: mockCandlestickResponse,
			ticker24hRaw: mock24hrTickerResponse,
			priceTickerRaw: mockPriceTickerResponse,
			bookTickerRaw: mockBookTickerResponse,
		}
	);
	await sendAllMarketData(
		buildMarketDataEntries(response),
		createMarketDataMetadata()
	);
	return publicationsOf("financial-scraper", mockScraperBroker.requests);
}

async function publishDlqEvents(): Promise<Publication[]> {
	notifyAddAudit("entry-1", "market.trade.recent.fetch" as never, "OPEN", null);
	// The human actions wait for message-manager to accept their event (ADR-0059).
	await expect(
		notifyReplayAudit({
			batchId: "batch-1",
			success: 3,
			failed: 1,
			actor: "ops-alice",
		})
	).resolves.toBe(true);
	await expect(notifyDeleteAudit(["entry-1"], 1, "ops-alice")).resolves.toBe(
		true
	);
	// The add does not wait for its publish.
	await new Promise((resolve) => setImmediate(resolve));
	return publicationsOf("dlq-service", mockDlqBroker.requests);
}

async function publishTrainedModel(): Promise<Publication[]> {
	const publisher = new ModelPublisher(
		{
			post: {
				indirect: (payload: unknown, metadata: never) =>
					mockTrainerBroker.client.publish(payload, metadata),
			},
		} as never,
		{ trainerId: "trader-trainer", instanceId: "trader-trainer-1" }
	);
	await publisher.publish(
		toSymbol("BTCUSDT") as never,
		{
			id: "agent-1",
			generation: 3,
			fitness: 1.2,
			sharpe: 0.8,
			avgPnl: 12.5,
			maxDrawdown: 4.25,
			gaControl: {
				populationSize: 20,
				elitismFraction: 0.1,
				survivorFraction: 0.5,
				episodesPerIndividual: 2,
				selectionType: "tournament",
				fitnessType: "sharpe",
			},
			network: {
				inputDim: 16,
				outputDim: 3,
				hiddenLayers: [{ neurons: 32, activation: "relu" }],
			},
			rl: {
				gamma: 0.99,
				learningRate: 0.001,
				epsilonStart: 1,
				epsilonMin: 0.05,
				epsilonDecay: 0.995,
			},
		} as never,
		{ version: "20261029T101530Z-0123456789ab", sha256: "ab".repeat(32) }
	);
	return publicationsOf("trader-trainer", mockTrainerBroker.requests);
}

describe("service message contracts", () => {
	let publications: Publication[] = [];
	const trainer = createTrainerSubscriber();
	const audit = createAuditSubscriber();
	const subscribers = [
		{ name: "trader-trainer", topics: trainer.topics as string[] },
		{ name: "audit-logger", topics: audit.topics },
	];

	beforeAll(async () => {
		publications = [
			...(await publishScrapeCycle()),
			...(await publishTrainedModel()),
			...(await publishDlqEvents()),
		];
	});

	afterAll(() => trainer.dispose());

	describe("topic catalogue", () => {
		it("every declared topic is published, or listed as unpublished", () => {
			const published = new Set(publications.map((p) => p.topic));
			const orphans = ALL_TOPICS.filter(
				(topic) => !(published.has(topic) || topic in UNPUBLISHED_TOPICS)
			);

			expect(orphans).toEqual([]);
		});

		it("no topic listed as unpublished is actually published", () => {
			const stale = publications
				.map((p) => p.topic)
				.filter((topic) => topic in UNPUBLISHED_TOPICS);

			expect(stale).toEqual([]);
		});

		it("producers only publish declared topics", () => {
			const undeclared = publications
				.map((p) => p.topic)
				.filter((topic) => !ALL_TOPICS.includes(topic));

			expect(undeclared).toEqual([]);
		});

		it("every published topic has at least one subscriber", () => {
			const unconsumed = publications
				.map((p) => p.topic)
				.filter((topic) => !subscribers.some((s) => s.topics.includes(topic)));

			expect(unconsumed).toEqual([]);
		});

		it("subscribers only subscribe to declared topics", () => {
			const undeclared = subscribers.flatMap((s) =>
				s.topics
					.filter((topic) => !ALL_TOPICS.includes(topic))
					.map((t) => `${s.name}: ${t}`)
			);

			expect(undeclared).toEqual([]);
		});

		it("every topic trader-trainer depends on is published by someone", () => {
			const published = new Set(publications.map((p) => p.topic));

			expect(trainer.topics.filter((topic) => !published.has(topic))).toEqual(
				[]
			);
		});
	});

	describe("message-manager accepts what producers publish", () => {
		it.each(ALL_TOPICS.filter((t) => !(t in UNPUBLISHED_TOPICS)))(
			"%s",
			async (topic) => {
				const forTopic = publications.filter((p) => p.topic === topic);
				expect(forTopic.length).toBeGreaterThan(0);

				for (const publication of forTopic) {
					const relayed = await relayThroughMessageManager(publication.request);
					expect(relayed).toMatchObject({ accepted: true });
				}
			}
		);
	});

	describe("subscribers accept and use what message-manager delivers", () => {
		async function deliveredBodies(topic: string): Promise<unknown[]> {
			const bodies: unknown[] = [];
			for (const publication of publications.filter((p) => p.topic === topic)) {
				const relayed = await relayThroughMessageManager(publication.request);
				if (relayed.accepted) {
					bodies.push(relayed.delivered);
				}
			}
			return bodies;
		}

		function bufferState(): string {
			const { buffer } = trainer;
			return JSON.stringify({
				states: buffer.getSymbols().map((s) => buffer.getSymbolState(s)),
			});
		}

		it.each(trainer.topics as string[])(
			"trader-trainer: %s is validated and reaches the market data buffer",
			async (topic) => {
				const before = bufferState();

				for (const body of await deliveredBodies(topic)) {
					const reception = await trainer.receive(body);
					expect(reception).toEqual({ status: 200 });
				}

				expect(bufferState()).not.toEqual(before);
			}
		);

		it.each(audit.topics.filter((t) => !(t in UNPUBLISHED_TOPICS)))(
			"audit-logger: %s is recorded with its payload",
			async (topic) => {
				for (const body of await deliveredBodies(topic)) {
					const reception = await audit.receive(body);
					expect(reception.status).toBe(200);
					const document = audit.documents.at(-1);
					expect(document).toMatchObject({
						metadata: { topic },
						payload: (body as { payload: unknown }).payload,
					});
					expect(Number.isNaN(document?.receivedAt.getTime())).toBe(false);
					expect(document?.metadata.messageId).toEqual(expect.any(String));
					expect(document?.metadata.publisher).toEqual(expect.any(String));
				}
			}
		);

		it.each([DlqEvent.EntriesDeleted, DlqEvent.ReplayCompleted])(
			"audit-logger: %s records the API key name of the operator (ADR-0059)",
			async (topic) => {
				for (const body of await deliveredBodies(topic)) {
					await audit.receive(body);
					expect(audit.documents.at(-1)?.payload).toMatchObject({
						actor: "ops-alice",
					});
				}
			}
		);
	});

	describe("dead letters replayed by dlq-service reach the subscribers again", () => {
		const receivers = [
			{ topics: trainer.topics as string[], receive: trainer.receive },
			{ topics: audit.topics, receive: audit.receive },
		];

		it.each(ALL_TOPICS.filter((t) => !(t in UNPUBLISHED_TOPICS)))(
			"%s",
			async (topic) => {
				for (const publication of publications.filter(
					(p) => p.topic === topic
				)) {
					const first = await relayThroughMessageManager(publication.request);
					if (!first.accepted) {
						throw new Error(first.error);
					}

					const { stored, replay } = await deadLetterAndReplay(first.message);
					expect(stored.topic).toBe(topic);

					const replayed = await relayThroughMessageManager(replay);
					expect(replayed).toMatchObject({ accepted: true });
					if (!replayed.accepted) {
						continue;
					}
					// ADR-0043: only the failed service, under the original messageId.
					expect(replayed.journaledFor).toEqual({
						services: ["audit-logger"],
						onlyFor: "audit-logger",
					});
					expect(replayed.message.metadata.messageId).toBe(
						first.message.metadata.messageId
					);
					expect((replayed.delivered as { payload: unknown }).payload).toEqual(
						(first.delivered as { payload: unknown }).payload
					);
					for (const receiver of receivers.filter((r) =>
						r.topics.includes(topic)
					)) {
						expect((await receiver.receive(replayed.delivered)).status).toBe(
							200
						);
					}
				}
			}
		);
	});
});
