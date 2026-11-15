import type { Message } from "@trading-model/contracts/message-types";
import { DeadStreams } from "../../../packages/broker-message/src/bus/dead-streams";
import { RedisMessageJournal } from "../../../packages/broker-message/src/bus/redis-journal";
import { StreamRedis } from "../../../packages/broker-message/tests/fixtures/stream-redis";
import { HttpMessageDelivery } from "../../../services/message-manager/src/adapters/outbound/http-message-delivery";
import { RedisDeadLetterStore } from "../../../services/message-manager/src/adapters/outbound/redis-dead-letter-store";

/**
 * A message's dead-letter round trip (ADR-0073): message-manager dead-letters
 * it into its dead stream, the operator CLI replays it. Returns the dead
 * letter and what the failed group (and no other) reads back.
 */
export async function deadLetterAndReplay(
	message: Message,
	service = "audit-logger"
): Promise<{
	stored: { topic: string; group: string };
	replayed: Message[];
	replayedToOthers: Message[];
}> {
	const redis = new StreamRedis();
	const journal = new RedisMessageJournal({ redis, keyPrefix: "p" });
	const streams = new DeadStreams(journal);
	const topic = message.metadata.topic;
	const groups = [service, "other-service"].map((name) => ({
		topic,
		service: name,
	}));
	for (const group of groups) {
		await journal.register(group);
	}
	await journal.append(message, []);
	const [entry] = await journal.readNew(groups[0] as never, "mm", 1);
	await new HttpMessageDelivery(
		{} as never,
		new RedisDeadLetterStore(streams, () => undefined)
	).markDeadLetter({
		service,
		entryId: entry?.id as string,
		message,
		reason: "MAX_RETRIES_EXCEEDED",
		deliveryAttempt: 10 as never,
	});

	const [stored] = await streams.list(topic);
	await streams.replay(topic, stored?.id as string);
	return {
		stored: { topic, group: stored?.group as string },
		replayed: (await journal.readNew(groups[0] as never, "mm", 10)).map(
			(item) => item.message
		),
		replayedToOthers: (await journal.readNew(groups[1] as never, "mm", 10)).map(
			(item) => item.message
		),
	};
}
