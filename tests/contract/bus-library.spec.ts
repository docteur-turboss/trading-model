import { describe, expect, it } from "@jest/globals";
import { BusConsumer } from "../../packages/broker-message/src/bus/consumer";
import { DeadStreams } from "../../packages/broker-message/src/bus/dead-streams";
import { publishToBus } from "../../packages/broker-message/src/bus/publisher";
import { RedisMessageJournal } from "../../packages/broker-message/src/bus/redis-journal";
import { StreamRedis } from "../../packages/broker-message/tests/fixtures/stream-redis";

/**
 * Publish → consume through the library alone (ADR-0073): the publisher's
 * XADD reaches the subscriber's handler with the envelope intact, with no
 * HTTP and no message-manager in between.
 */

const TOPIC = "training.model.published";

describe("bus contract: publisher → subscriber, no HTTP", () => {
	it("hands the subscriber the payload and the metadata the publisher wrote, once per service", async () => {
		const redis = new StreamRedis();
		const received: Record<string, unknown[]> = { a: [], b: [] };
		const consumers = ["a", "b"].map((service) => {
			const journal = new RedisMessageJournal({ redis, keyPrefix: "p" });
			return new BusConsumer({
				journal,
				deadStreams: new DeadStreams(journal),
				service,
				handle: async (message) => {
					received[service]?.push(message);
				},
			});
		});
		await Promise.all(consumers.map((consumer) => consumer.start([TOPIC])));

		await publishToBus(
			new RedisMessageJournal({ redis, keyPrefix: "p" }),
			{ close: 101.5 },
			{
				topic: TOPIC,
				publisher: {
					serviceName: "trader-trainer",
					instanceId: "trader-trainer-1",
				},
			} as never
		);
		for (
			let i = 0;
			i < 100 && (received.a?.length ?? 0) + (received.b?.length ?? 0) < 2;
			i++
		) {
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		await Promise.all(consumers.map((consumer) => consumer.stop()));

		for (const service of ["a", "b"]) {
			expect(received[service]).toEqual([
				expect.objectContaining({
					payload: { close: 101.5 },
					metadata: expect.objectContaining({
						topic: TOPIC,
						messageId: expect.any(String),
						emittedAt: expect.any(Number),
					}),
				}),
			]);
		}
	});
});
