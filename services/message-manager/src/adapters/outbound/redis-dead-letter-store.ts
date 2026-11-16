import type { DeadStreams } from "@trading-model/broker-message/bus/dead-streams";
import type {
	DeadLetterInput,
	DeadLetterStorePort,
} from "../../domain/ports/dead-letter-store.port";

/**
 * Copies the message to its dead stream and acknowledges the journal entry in
 * one transaction (ADR-0073). A failure is thrown: the entry then stays
 * pending and is retried.
 */
export class RedisDeadLetterStore implements DeadLetterStorePort {
	constructor(
		private readonly _streams: DeadStreams,
		/** Called once stored, e.g. to record `dlq.entry.added` on the audit trail. */
		private readonly _onStored: (input: DeadLetterInput, id: string) => void
	) {}

	async insert(input: DeadLetterInput): Promise<void> {
		const { service, entryId, message, reason, deliveryAttempt } = input;
		const id = await this._streams.deadLetter(
			{ topic: message.metadata.topic, service },
			entryId,
			message,
			reason,
			deliveryAttempt
		);
		this._onStored(input, id);
	}
}
