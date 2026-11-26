import type { Message } from "@trading-model/contracts/message-types";
import { messageManagerError } from "../shared/errors";
import type { JournalGroup } from "./journal.port";
import { isRedisError, type RedisMessageJournal } from "./redis-journal";

/** One dead letter: what a group could not process, kept until an operator replays or deletes it. */
export interface DeadLetter {
	/** Entry id in the dead stream. */
	id: string;
	topic: string;
	group: string;
	attempts: number;
	reason: string;
	message: Message;
	deadAt: number;
}

/**
 * Age kept in a dead stream (ADR-0073 §4, issue #2195): each new dead letter trims the
 * entries older than this with `MINID ~`, so a full Redis cannot stop the bus. Seven days
 * let an operator replay or delete after `BusDeadLetters`; the `dlq.entry.added` audit
 * event outlives the purge.
 */
const DEAD_LETTER_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Dead streams (ADR-0073): `<prefix>:dead:<topic>`, trimmed by age
 * ({@link DEAD_LETTER_RETENTION_MS}) on write. A message is copied there and
 * acknowledged in the journal in one `MULTI`/`EXEC`.
 */
export class DeadStreams {
	constructor(private readonly _journal: RedisMessageJournal) {}

	/**
	 * @returns the id of the entry in the dead stream.
	 * @throws when the transaction fails: the entry then stays pending and is retried.
	 */
	async deadLetter(
		group: JournalGroup,
		entryId: string,
		message: Message,
		reason: string,
		attempts: number
	): Promise<string> {
		const now = Date.now();
		const tx = this._journal.redis.multi();
		tx.call(
			"XADD",
			this._dead(group.topic),
			"MINID",
			"~",
			String(now - DEAD_LETTER_RETENTION_MS),
			"*",
			"group",
			group.service,
			"attempts",
			String(attempts),
			"reason",
			reason,
			"deadAt",
			String(now),
			"message",
			JSON.stringify(message)
		);
		tx.call("XACK", this._journal.stream(group.topic), group.service, entryId);
		const results = await tx.exec();
		const failed = results?.find(([err]) => err)?.[0];
		if (!results || failed) {
			throw messageManagerError("Dead letter not stored", {
				cause: failed ?? undefined,
			});
		}
		return results[0]?.[1] as string;
	}

	/**
	 * Writes a dead letter that did not come from the journal (the one-off
	 * import of the MongoDB DLQ). Idempotent per `sourceId`: a second call with
	 * the same one writes nothing.
	 *
	 * @returns false when `sourceId` was imported already.
	 */
	async restore(
		letter: Omit<DeadLetter, "id">,
		sourceId: string
	): Promise<boolean> {
		const imported = `${this._journal.keyPrefix}:dead-imported`;
		if (await this._journal.redis.call("SISMEMBER", imported, sourceId)) {
			return false;
		}
		const tx = this._journal.redis.multi();
		tx.call(
			"XADD",
			this._dead(letter.topic),
			"*",
			"group",
			letter.group,
			"attempts",
			String(letter.attempts),
			"reason",
			letter.reason,
			"deadAt",
			String(letter.deadAt),
			"message",
			JSON.stringify(letter.message)
		);
		tx.call("SADD", imported, sourceId);
		const results = await tx.exec();
		if (!results || results.some(([err]) => err)) {
			throw messageManagerError(`Dead letter ${sourceId} not restored`);
		}
		return true;
	}

	/**
	 * Up to 100 dead letters of a topic, oldest first. Pass the id of the last letter
	 * received as `after` (exclusive) to read the next page.
	 */
	list(topic: string, after?: string, count = 100): Promise<DeadLetter[]> {
		return this._range(topic, after ? `(${after}` : "-", "+", count);
	}

	/**
	 * Gives the entry back to its group only, under its own `messageId`, then
	 * removes it. A crash between the two replays it twice: subscribers
	 * deduplicate on `messageId`.
	 *
	 * @returns false when the entry does not exist.
	 */
	async replay(topic: string, id: string): Promise<boolean> {
		const [found] = await this._range(topic, id, id, 1);
		if (!found) {
			return false;
		}
		await this._journal.append(found.message, [found.group], found.group);
		await this._journal.redis.call("XDEL", this._dead(topic), id);
		return true;
	}

	async delete(topic: string, id: string): Promise<boolean> {
		return (
			Number(await this._journal.redis.call("XDEL", this._dead(topic), id)) > 0
		);
	}

	async length(topic: string): Promise<number> {
		// XINFO STREAM, not XLEN: the N-1 message-manager ACL grants +xinfo only.
		try {
			const flat = (await this._journal.redis.call(
				"XINFO",
				"STREAM",
				this._dead(topic)
			)) as unknown[];
			return Number(flat[flat.indexOf("length") + 1]);
		} catch (err) {
			if (isRedisError(err, "no such key")) {
				return 0;
			}
			throw err;
		}
	}

	private async _range(
		topic: string,
		from: string,
		to: string,
		count: number
	): Promise<DeadLetter[]> {
		const reply = (await this._journal.redis.call(
			"XRANGE",
			this._dead(topic),
			from,
			to,
			"COUNT",
			String(count)
		)) as [string, string[]][];
		return reply.map(([id, flat]) => this._parse(topic, id, flat));
	}

	private _parse(topic: string, id: string, flat: string[]): DeadLetter {
		const field = (name: string) => flat[flat.indexOf(name) + 1] as string;
		return {
			id,
			topic,
			group: field("group"),
			attempts: Number(field("attempts")),
			reason: field("reason"),
			deadAt: Number(field("deadAt")),
			message: JSON.parse(field("message")) as Message,
		};
	}

	private _dead(topic: string): string {
		return `${this._journal.keyPrefix}:dead:${topic}`;
	}
}
