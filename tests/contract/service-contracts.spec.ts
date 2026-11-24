import { beforeAll, describe, expect, it, jest } from "@jest/globals";
import { AuditEvent } from "@trading-model/contracts/audit-events";
import { DlqEvent } from "@trading-model/contracts/dlq-events";
import { RiskEvent } from "@trading-model/contracts/risk-events";
import { TrainingEvent } from "@trading-model/contracts/training-events";
import { TradingSymbol } from "@trading-model/primitives/primitives";
import {
	createRecordingBrokerClient,
	type PublishedRequest,
	relayThroughMessageManager,
} from "./support/broker-pipeline";
import { deadLetterAndReplay } from "./support/dead-letter-replay";
import { createAuditSubscriber } from "./support/subscribers";

/**
 * Cross-service message contracts, checked on the real code of both ends.
 *
 * Producers run their actual publishing code (dlq-service audit notifier,
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

const mockTrainerBroker = createRecordingBrokerClient("trader-trainer");
const mockDlqBroker = createRecordingBrokerClient("dlq-service");
const mockRiskBroker = createRecordingBrokerClient("risk-execution");
const mockConsumerBroker = createRecordingBrokerClient("decision-consumer");

jest.mock("../../services/message-manager/src/config/metrics", () => ({
	MESSAGES_DLQ_TOTAL: { inc: () => undefined },
}));
jest.mock("../../services/audit-logger/src/config/metrics", () => ({
	EVENTS_INGESTED_TOTAL: { inc: () => undefined },
}));
// dlq-service, risk-execution and decision-consumer publish their events through the real broker client.
jest.mock("@trading-model/broker-message/create-message-manager", () => ({
	createMessageManager: () => ({
		messageManager: {
			post: {
				indirect: (
					payload: unknown,
					metadata: { publisher: { serviceName: string } }
				) =>
					(
						({
							"risk-execution": mockRiskBroker,
							"decision-consumer": mockConsumerBroker,
						})[metadata.publisher.serviceName] ?? mockDlqBroker
					).client.publish(payload, metadata as never),
			},
		},
	}),
}));
jest.mock(
	"../../services/risk-execution/src/infrastructure/config/env",
	() => ({
		ENV: {
			INSTANCE_ID: "risk-execution-1",
			SERVICE_NAME: "risk-execution",
			MESSAGE_CALLBACK_PATH: "message",
		},
	})
);
jest.mock("../../services/risk-execution/src/config/address-manager", () => ({
	AddressManager: {},
}));
jest.mock(
	"../../services/decision-consumer/src/config/address-manager",
	() => ({
		AddressManager: {},
	})
);
jest.mock("../../services/dlq-service/src/infrastructure/config/env", () => ({
	ENV: {
		INSTANCE_ID: "dlq-service-1",
		SERVICE_NAME: "dlq-service",
		MESSAGE_CALLBACK_PATH: "message",
	},
}));
jest.mock("@trading-model/common/config/tls-paths", () => ({
	buildTlsFromEnv: () => ({}),
}));
jest.mock("../../services/dlq-service/src/config/address-manager", () => ({
	AddressManager: {},
}));

import { PromotionAudit } from "../../services/decision-consumer/src/adapters/outbound/promotion-audit";
import {
	notifyDeleteAudit,
	notifyReplayAudit,
} from "../../services/dlq-service/src/adapters/outbound/audit-notifier";
import { publishRiskEvent } from "../../services/risk-execution/src/config/audit";
import { ModelPublisher } from "../../services/trader-trainer/src/adapters/outbound/model-publisher";

/**
 * Topics declared in the contracts package that no service publishes yet.
 * Listing one here is a decision, not a default: the catalogue test fails
 * when a topic is neither published nor listed, and when a listed topic
 * starts being published.
 */
const UNPUBLISHED_TOPICS: Record<string, string> = {
	[AuditEvent.AuditHeartbeat]: "reserved for audit heartbeats, no producer",
	[AuditEvent.AuditGapDetected]: "reserved for audit gap reports, no producer",
	[DlqEvent.EntryAdded]:
		"written into the journal by message-manager's dead-letter store (bus-library.spec.ts, dead-letter.spec.ts)",
};

const ALL_TOPICS: string[] = [
	...Object.values(AuditEvent),
	...Object.values(TrainingEvent),
	...Object.values(DlqEvent),
	...Object.values(RiskEvent),
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

async function publishDlqEvents(): Promise<Publication[]> {
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
	return publicationsOf("dlq-service", mockDlqBroker.requests);
}

async function publishRiskEvents(): Promise<Publication[]> {
	const mode = "paper";
	publishRiskEvent("order.transition", {
		mode,
		clientOrderId: "rx-1",
		symbol: "BTCUSDT",
		status: "filled",
		reason: undefined,
	});
	publishRiskEvent("kill_switch.engaged", {
		mode,
		scope: "global",
		symbol: null,
		reason: "drawdown",
		actor: "system",
	});
	publishRiskEvent("kill_switch.rearmed", {
		mode,
		scope: "global",
		symbol: undefined,
		reason: "checked",
		actor: "owner",
	});
	// Fire and forget: let the publishes settle.
	await new Promise((resolve) => setImmediate(resolve));
	await new PromotionAudit(
		{} as never,
		"decision-consumer-1" as never,
		"message"
	).promotionLoaded({
		symbol: "BTCUSDT",
		version: "20261029T101530Z-0123456789ab",
		sha256: "ab".repeat(32),
	});
	return [
		...publicationsOf("risk-execution", mockRiskBroker.requests),
		...publicationsOf("decision-consumer", mockConsumerBroker.requests),
	];
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
		TradingSymbol.of("BTCUSDT") as never,
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
	const audit = createAuditSubscriber();
	const subscribers = [{ name: "audit-logger", topics: audit.topics }];

	beforeAll(async () => {
		publications = [
			...(await publishTrainedModel()),
			...(await publishDlqEvents()),
			...(await publishRiskEvents()),
		];
	});

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

	describe("dead letters replayed by the CLI reach the subscribers again", () => {
		const receivers = [{ topics: audit.topics, receive: audit.receive }];

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

					const { stored, replayed } = await deadLetterAndReplay(first.message);
					expect(stored.topic).toBe(topic);
					// ADR-0043: only the failed service, under the original messageId.
					expect(stored.group).toBe("audit-logger");
					expect(replayed.map((m) => m.metadata.messageId)).toEqual([
						first.message.metadata.messageId,
					]);
					const delivered = {
						metadata: replayed[0]?.metadata,
						payload: replayed[0]?.payload,
					};
					expect(delivered.payload).toEqual(
						(first.delivered as { payload: unknown }).payload
					);
					for (const receiver of receivers.filter((r) =>
						r.topics.includes(topic)
					)) {
						expect((await receiver.receive(delivered)).status).toBe(200);
					}
				}
			}
		);
	});
});
