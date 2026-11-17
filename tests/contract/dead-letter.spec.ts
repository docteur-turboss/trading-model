import { describe, expect, it, jest } from "@jest/globals";
import { DeadStreams } from "../../packages/broker-message/src/bus/dead-streams";
import { createMessage } from "../../packages/broker-message/src/bus/message-factory";
import { RedisMessageJournal } from "../../packages/broker-message/src/bus/redis-journal";
import { StreamRedis } from "../../packages/broker-message/tests/fixtures/stream-redis";
import { HttpMessageDelivery } from "../../services/message-manager/src/adapters/outbound/http-message-delivery";
import { RedisDeadLetterStore } from "../../services/message-manager/src/adapters/outbound/redis-dead-letter-store";

/**
 * Dead-letter contract: message-manager → dead streams (ADR-0073). The real
 * delivery adapter and dead-letter store write what the library lists, replays
 * and deletes (the operator CLI), for the group that failed only.
 */

jest.mock("../../services/message-manager/src/config/metrics", () => ({
	MESSAGES_DLQ_TOTAL: { inc: () => undefined },
}));

const TOPIC = "market.candles.fetch";

describe("dead-letter contract: message-manager → dead streams", () => {
	async function setup() {
		const redis = new StreamRedis();
		const journal = new RedisMessageJournal({ redis, keyPrefix: "p" });
		const streams = new DeadStreams(journal);
		const message = createMessage({ close: 101.5 }, {
			topic: TOPIC,
			publisher: "financial-scraper",
		} as never);
		const group = (service: string) => ({ topic: TOPIC as never, service });
		for (const service of ["audit-logger", "trader-trainer"]) {
			await journal.register(group(service));
		}
		await journal.append(message, []);
		const delivery = new HttpMessageDelivery(
			{} as never,
			new RedisDeadLetterStore(streams, () => undefined)
		);
		return { journal, streams, message, delivery, group };
	}

	it("keeps a failed delivery as a dead letter of its group and takes it off the pending list", async () => {
		const { journal, streams, message, delivery, group } = await setup();
		const [entry] = await journal.readNew(group("trader-trainer"), "mm", 1);

		await delivery.markDeadLetter({
			service: "trader-trainer",
			entryId: entry?.id as string,
			message,
			reason: "MAX_RETRIES_EXCEEDED",
			deliveryAttempt: 10 as never,
		});

		const [dead] = await streams.list(TOPIC);
		expect(dead).toMatchObject({
			group: "trader-trainer",
			reason: "MAX_RETRIES_EXCEEDED",
			attempts: 10,
		});
		expect(dead?.message.metadata.messageId).toBe(message.metadata.messageId);
		expect(
			await journal.claimDue(
				group("trader-trainer"),
				"mm",
				{ floorMs: 0, dueAfterMs: () => 0 },
				10
			)
		).toEqual([]);
	});

	it("replays under the original messageId to the failed group only", async () => {
		const { journal, streams, message, delivery, group } = await setup();
		const [entry] = await journal.readNew(group("audit-logger"), "mm", 1);
		await delivery.markDeadLetter({
			service: "audit-logger",
			entryId: entry?.id as string,
			message,
			reason: "OPEN",
			deliveryAttempt: 5 as never,
		});
		const [dead] = await streams.list(TOPIC);

		await streams.replay(TOPIC, dead?.id as string);

		const replayed = await journal.readNew(group("audit-logger"), "mm", 10);
		expect(replayed.map((item) => item.message.metadata.messageId)).toEqual([
			message.metadata.messageId,
		]);
		expect(await streams.length(TOPIC)).toBe(0);
	});
});
