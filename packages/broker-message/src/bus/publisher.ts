import { getLogger } from "@trading-model/contracts/logger-registry";
import type { MessageMetadata } from "@trading-model/contracts/message-types";
import { messageManagerError } from "../shared/errors";
import { withTraceparent } from "../shared/trace-context";
import { createMessage } from "./message-factory";
import type { RedisMessageJournal } from "./redis-journal";

/**
 * Publishes straight into the journal stream of the topic (ADR-0073): no
 * message-manager. Durable once it resolves; a refused `XADD` (Redis full under
 * `noeviction`, too few replicas) rejects, it is never reported as sent.
 */
export async function publishToBus(
	journal: RedisMessageJournal,
	payload: unknown,
	metadata: Omit<MessageMetadata, "emittedAt" | "messageId">
): Promise<void> {
	const message = createMessage(payload, withTraceparent(metadata as never));
	const { topic, messageId } = message.metadata;
	if (!(await journal.hasSubscribers(topic))) {
		if (message.metadata.delivery?.requireSubscriber) {
			throw messageManagerError(
				`No subscriber for topic ${topic}: publish refused, send it again`
			);
		}
		getLogger().warn("Message dropped: no subscriber for its topic", {
			context: { topic, messageId },
		});
		return;
	}
	try {
		await journal.append(message, []);
	} catch {
		// A refused WAIT leaves the entry in the journal: resend the same messageId, never a new one (consumers deduplicate on it).
		// shortcut: one resend, a second failure rejects to the caller, who then builds a new messageId.
		await journal.append(message, []);
	}
}
