import { messageManagerError } from "@trading-model/broker-message/shared/errors";
import type { Message } from "@trading-model/contracts/message-types";
import { logger } from "@trading-model/http/infrastructure/logger";
import type Redis from "ioredis";
import { JOURNAL_TRIMMED_PENDING_TOTAL } from "../../config/metrics";
import {
	JOURNAL_RETENTION_MS,
	type JournalEntry,
	type JournalGroup,
	type JournalGroupLag,
	type MessageJournalPort,
} from "../../domain/ports/message-journal.port";

export interface RedisMessageJournalDeps {
	redis: Pick<Redis, "call" | "sadd" | "smembers">;
	/**
	 * Opens a connection of its own for a blocking read (`XREADGROUP BLOCK`
	 * holds its connection, so one per group); absent: reads never block.
	 */
	openBlockingRedis?: () => Pick<Redis, "call" | "disconnect">;
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

/** `[k1, v1, k2, v2, ...]` of an XINFO reply as an object. */
function toRecord(flat: unknown[]): Record<string, unknown> {
	const record: Record<string, unknown> = {};
	for (let i = 0; i < flat.length; i += 2) {
		record[String(flat[i])] = flat[i + 1];
	}
	return record;
}

type StreamReply = [id: string, fields: string[] | null][] | null;

/**
 * Journal in Redis Streams (ADR-0048): one stream per topic, one consumer
 * group per subscriber service. The pending list of each group carries the
 * retry state (last attempt, number of deliveries) shared by all replicas.
 * Never `KEYS` (ADR-0023): the groups are listed from a set.
 */
export class RedisMessageJournal implements MessageJournalPort {
	private readonly _now: () => number;
	/** Groups this process already created and listed: `append` skips them (invalidated on NOGROUP). */
	private readonly _registered = new Set<string>();
	private readonly _readers = new Map<
		string,
		Pick<Redis, "call" | "disconnect">
	>();

	constructor(private readonly _deps: RedisMessageJournalDeps) {
		this._now = _deps.now ?? Date.now;
	}

	async register(group: JournalGroup): Promise<void> {
		const key = `${group.topic}|${group.service}`;
		if (this._registered.has(key)) {
			return;
		}
		await this._ensureGroup(group);
		await this._deps.redis.sadd(this._groupsKey(), key);
		this._registered.add(key);
	}

	/** Closes the blocking connections, which ends the reads waiting on them. */
	close(): void {
		for (const reader of this._readers.values()) {
			reader.disconnect();
		}
		this._readers.clear();
	}

	async append(
		message: Message,
		services: readonly string[],
		onlyFor?: string
	): Promise<void> {
		const { topic } = message.metadata;
		// A stream Redis lost (restart without AOF) has no groups left: XADD would recreate it bare and the
		// groups, created later at "$", would miss this message. Re-register before writing (ADR-0048 §1).
		if (
			Number(await this._deps.redis.call("EXISTS", this._stream(topic))) === 0
		) {
			for (const service of services) {
				this._registered.delete(`${topic}|${service}`);
			}
		}
		await Promise.all(
			services.map((service) => this.register({ topic, service }))
		);
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
		count: number,
		blockMs?: number
	): Promise<JournalEntry[]> {
		let reply: [stream: string, entries: StreamReply] | null;
		try {
			reply = (await this._reader(group, blockMs).call(
				"XREADGROUP",
				"GROUP",
				group.service,
				consumer,
				"COUNT",
				String(count),
				...(blockMs ? ["BLOCK", String(blockMs)] : []),
				"STREAMS",
				this._stream(group.topic),
				">"
			)) as typeof reply;
		} catch (err) {
			await this._recoverNoGroup(err, group);
			return [];
		}
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
		let pending: [
			id: string,
			consumer: string,
			idleMs: number,
			deliveries: number,
		][];
		try {
			pending = (await this._deps.redis.call(
				"XPENDING",
				stream,
				group.service,
				"IDLE",
				String(retry.floorMs),
				"-",
				"+",
				String(count)
			)) as typeof pending;
		} catch (err) {
			await this._recoverNoGroup(err, group);
			return [];
		}
		const due = pending.filter(
			([, , idleMs, deliveries]) => idleMs >= retry.dueAfterMs(deliveries)
		);
		// MIN-IDLE makes each claim atomic: of two replicas, one wins. Promise.all keeps the XPENDING order.
		const batches = await Promise.all(
			due.map(async ([id, , , deliveries]) => {
				const claimed = (await this._deps.redis.call(
					"XCLAIM",
					stream,
					group.service,
					consumer,
					String(retry.dueAfterMs(deliveries)),
					id
				)) as StreamReply;
				return this._parse(group, claimed, () => deliveries + 1);
			})
		);
		const entries: JournalEntry[] = batches.flat();
		return entries;
	}

	async lag(): Promise<JournalGroupLag[]> {
		const groups = await this.groups();
		const infos = new Map<string, Record<string, unknown>>();
		for (const topic of new Set(groups.map((group) => group.topic))) {
			try {
				// One call per topic lists all its groups (Redis >= 7 for `lag`).
				const reply = (await this._deps.redis.call(
					"XINFO",
					"GROUPS",
					this._stream(topic)
				)) as unknown[][];
				for (const flat of reply) {
					const info = toRecord(flat);
					infos.set(`${topic}|${info.name}`, info);
				}
			} catch (err) {
				// The stream is gone (Redis restart without AOF): nothing is pending on it.
				if (!(err instanceof Error && err.message.includes("no such key"))) {
					throw err;
				}
			}
		}
		const now = this._now();
		// One group per task: its three reads stay ordered, groups overlap.
		const results = await Promise.all(
			groups.map(async (group): Promise<JournalGroupLag | undefined> => {
				const info = infos.get(`${group.topic}|${group.service}`);
				if (!info) {
					return undefined;
				}
				const stream = this._stream(group.topic);
				let count: number;
				let oldestPending: string | null;
				let unread: [string, unknown][];
				try {
					[count, oldestPending] = (await this._deps.redis.call(
						"XPENDING",
						stream,
						group.service
					)) as [number, string | null];
					unread = (await this._deps.redis.call(
						"XRANGE",
						stream,
						`(${info["last-delivered-id"]}`,
						"+",
						"COUNT",
						"1"
					)) as [string, unknown][];
				} catch (err) {
					// The group vanished since XINFO: skip it, keep the others.
					if (err instanceof Error && err.message.includes("NOGROUP")) {
						return undefined;
					}
					throw err;
				}
				// shortcut: a nil `lag` (Redis cannot tell after an XDEL) counts the one unread entry seen, upgrade with a XLEN walk if it ever matters.
				const unreadCount = Number(info.lag ?? unread.length);
				const oldest = [oldestPending, unread[0]?.[0]]
					.filter((id): id is string => Boolean(id))
					.map((id) => Number(id.split("-")[0]))
					.sort((first, second) => first - second)[0];
				return {
					...group,
					pending: count + unreadCount,
					oldestPendingAgeMs:
						oldest === undefined ? 0 : Math.max(0, now - oldest),
				};
			})
		);
		return results.filter(
			(entry): entry is JournalGroupLag => entry !== undefined
		);
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

	/** NOGROUP: Redis lost the stream (restart without AOF), create the group again; any other error is rethrown. */
	private async _recoverNoGroup(
		err: unknown,
		group: JournalGroup
	): Promise<void> {
		if (!(err instanceof Error && err.message.includes("NOGROUP"))) {
			throw err;
		}
		this._registered.delete(`${group.topic}|${group.service}`);
		await this.register(group);
	}

	private _reader(group: JournalGroup, blockMs?: number) {
		if (!(blockMs && this._deps.openBlockingRedis)) {
			return this._deps.redis;
		}
		const key = `${group.topic}|${group.service}`;
		let reader = this._readers.get(key);
		if (!reader) {
			reader = this._deps.openBlockingRedis();
			this._readers.set(key, reader);
		}
		return reader;
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
