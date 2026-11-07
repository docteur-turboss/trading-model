import { messageManagerError } from "@trading-model/broker-message/shared/errors";
import type { Message } from "@trading-model/contracts/message-types";
import { logger } from "@trading-model/http/infrastructure/logger";
import type Redis from "ioredis";
import {
	JOURNAL_RETENTION_MS,
	type JournalEntry,
	type JournalGroup,
	type MessageJournalPort,
} from "../../application/ports/message-journal-port";
import { JOURNAL_TRIMMED_PENDING_TOTAL } from "../../config/metrics";

export interface RedisMessageJournalDeps {
	redis: Pick<Redis, "call" | "sadd" | "smembers">;
	keyPrefix: string;
	/**
	 * Replicas that must hold a write before it is accepted (`WAIT`): Sentinel
	 * replication is asynchronous, a failover could otherwise drop accepted
	 * messages. 0 for a single node.
	 */
	minReplicas?: number;
	now?: () => number;
}

const WAIT_REPLICAS_TIMEOUT_MS = 2000;
const FIELD = "message";
const ONLY_FIELD = "only";

type StreamReply = [id: string, fields: string[] | null][] | null;

/**
 * Journal in Redis Streams (ADR-0048): one stream per topic, one consumer
 * group per subscriber service. The pending list of each group carries the
 * retry state (last attempt, number of deliveries) shared by all replicas.
 * Never `KEYS` (ADR-0023): the groups are listed from a set.
 */
export class RedisMessageJournal implements MessageJournalPort {
	private readonly _now: () => number;

	constructor(private readonly _deps: RedisMessageJournalDeps) {
		this._now = _deps.now ?? Date.now;
	}

	async register(group: JournalGroup): Promise<void> {
		await this._ensureGroup(group);
		await this._deps.redis.sadd(
			this._groupsKey(),
			`${group.topic}|${group.service}`
		);
	}

	async append(
		message: Message,
		services: readonly string[],
		onlyFor?: string
	): Promise<void> {
		const { topic } = message.metadata;
		for (const service of services) {
			await this.register({ topic, service });
		}
		const entryId = (await this._deps.redis.call(
			"XADD",
			this._stream(topic),
			"MINID",
			"~",
			String(this._now() - JOURNAL_RETENTION_MS),
			"*",
			FIELD,
			JSON.stringify(message),
			...(onlyFor ? [ONLY_FIELD, onlyFor] : [])
		)) as string;
		const required = this._deps.minReplicas ?? 0;
		if (required > 0) {
			const replicated = await this._deps.redis.call(
				"WAIT",
				String(required),
				String(WAIT_REPLICAS_TIMEOUT_MS)
			);
			if (Number(replicated) < required) {
				// The publisher will send again under a new messageId: drop this entry so it is not delivered twice.
				await this._deps.redis.call("XDEL", this._stream(topic), entryId);
				throw messageManagerError(
					`Message not accepted: journal write held by ${replicated} of ${required} replicas`
				);
			}
		}
	}

	async groups(): Promise<JournalGroup[]> {
		const members = await this._deps.redis.smembers(this._groupsKey());
		return members.map((member) => {
			const cut = member.lastIndexOf("|");
			return {
				topic: member.slice(0, cut) as JournalGroup["topic"],
				service: member.slice(cut + 1),
			};
		});
	}

	async readNew(
		group: JournalGroup,
		consumer: string,
		count: number
	): Promise<JournalEntry[]> {
		const reply = (await this._deps.redis.call(
			"XREADGROUP",
			"GROUP",
			group.service,
			consumer,
			"COUNT",
			String(count),
			"STREAMS",
			this._stream(group.topic),
			">"
		)) as [stream: string, entries: StreamReply] | null;
		// ioredis `call` hands one stream back as [name, entries], not [[name, entries]].
		return this._parse(group, reply?.[1] ?? null, () => 1);
	}

	async claimDue(
		group: JournalGroup,
		consumer: string,
		retry: { floorMs: number; dueAfterMs: (deliveries: number) => number },
		count: number
	): Promise<JournalEntry[]> {
		const stream = this._stream(group.topic);
		const pending = (await this._deps.redis.call(
			"XPENDING",
			stream,
			group.service,
			"IDLE",
			String(retry.floorMs),
			"-",
			"+",
			String(count)
		)) as [id: string, consumer: string, idleMs: number, deliveries: number][];
		const entries: JournalEntry[] = [];
		for (const [id, , idleMs, deliveries] of pending) {
			const due = retry.dueAfterMs(deliveries);
			if (idleMs < due) {
				continue;
			}
			// MIN-IDLE makes the claim atomic: of two replicas, one wins.
			const claimed = (await this._deps.redis.call(
				"XCLAIM",
				stream,
				group.service,
				consumer,
				String(due),
				id
			)) as StreamReply;
			entries.push(
				...(await this._parse(group, claimed, () => deliveries + 1))
			);
		}
		return entries;
	}

	async ack(group: JournalGroup, id: string): Promise<void> {
		await this._deps.redis.call(
			"XACK",
			this._stream(group.topic),
			group.service,
			id
		);
	}

	/** Parses entries; acks trimmed ones (no body) so they leave the pending list on any Redis version. */
	private async _parse(
		group: JournalGroup,
		reply: StreamReply,
		deliveries: () => number
	): Promise<JournalEntry[]> {
		const entries: JournalEntry[] = [];
		for (const [id, fields] of reply ?? []) {
			const at = fields?.indexOf(FIELD) ?? -1;
			const only = fields?.indexOf(ONLY_FIELD) ?? -1;
			// Targeted replay: the other groups see the entry too and settle it unread.
			const forOthers =
				fields && only >= 0 && fields[only + 1] !== group.service;
			if (fields && at >= 0 && !forOthers) {
				entries.push({
					id,
					message: JSON.parse(fields[at + 1] as string) as Message,
					deliveries: deliveries(),
				});
			} else {
				// Trimmed (24 h) before delivery: the message is gone for good, so it is counted, logged and alerted.
				JOURNAL_TRIMMED_PENDING_TOTAL.inc({
					topic: group.topic,
					service: group.service,
				});
				logger.error("Journal entry trimmed before delivery: message lost", {
					topic: group.topic,
					service: group.service,
					entryId: id,
				});
				await this.ack(group, id);
			}
		}
		return entries;
	}

	private async _ensureGroup(group: JournalGroup): Promise<void> {
		try {
			// "$": a group sees what is written after it exists, so it must exist before the XADD.
			await this._deps.redis.call(
				"XGROUP",
				"CREATE",
				this._stream(group.topic),
				group.service,
				"$",
				"MKSTREAM"
			);
		} catch (err) {
			if (!(err instanceof Error && err.message.includes("BUSYGROUP"))) {
				throw err;
			}
		}
	}

	private _stream(topic: string): string {
		return `${this._deps.keyPrefix}:journal:${topic}`;
	}

	private _groupsKey(): string {
		return `${this._deps.keyPrefix}:journal-groups`;
	}
}
