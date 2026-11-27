import { normalizeError } from "@trading-model/common/utils/errors";
import type { Message } from "@trading-model/contracts/message-types";
import { logger } from "@trading-model/http/logger";
import { messageManagerError } from "../shared/errors";
import {
	JOURNAL_RETENTION_MS,
	type JournalEntry,
	type JournalGroup,
	type JournalGroupLag,
	type MessageJournalPort,
} from "./journal.port";
import {
	JOURNAL_TRIMMED_PENDING_TOTAL,
	JOURNAL_UNREADABLE_TOTAL,
} from "./metrics";

/** The ioredis commands the bus uses (a client of `@trading-model/persistence` fits). */
export interface BusRedis {
	call(command: string, ...args: string[]): Promise<unknown>;
	sadd(key: string, ...members: string[]): Promise<unknown>;
	smembers(key: string): Promise<string[]>;
	/** `MULTI`/`EXEC`: each result is `[error, reply]`, `null` when the transaction was discarded. */
	multi(): {
		call(command: string, ...args: string[]): unknown;
		exec(): Promise<[Error | null, unknown][] | null>;
	};
}

export interface BlockingBusRedis {
	call(command: string, ...args: string[]): Promise<unknown>;
	sadd(key: string, ...members: string[]): Promise<unknown>;
	disconnect(): void;
}

export interface RedisMessageJournalDeps {
	redis: BusRedis;
	/**
	 * Opens a connection of its own for a blocking read (`XREADGROUP BLOCK`
	 * holds its connection, so one per group); absent: reads never block.
	 */
	openBlockingRedis?: () => BlockingBusRedis;
	/**
	 * Opens the connection of `XADD` + `WAIT` (opened once): `WAIT` holds its
	 * connection up to 2 s and would delay `XACK`/`XCLAIM` queued behind it;
	 * absent: writes share `redis`.
	 */
	openWriteRedis?: () => BlockingBusRedis | Promise<BlockingBusRedis>;
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
/**
 * Options of the `XADD` + `WAIT` connection. `commandTimeout` is above the 2 s of `WAIT`.
 * No offline queue: ioredis does not drop a command rejected by `commandTimeout` from that queue
 * and writes it on reconnection, so a queued `XADD` would land after the 503 and the publisher's retry would duplicate it.
 * Offline, a write fails at once. `lazyConnect` off: a lazy client has no stream yet and would reject the first write.
 */
export const JOURNAL_WRITE_OPTIONS = {
	commandTimeout: WAIT_REPLICAS_TIMEOUT_MS + 2000,
	enableOfflineQueue: false,
	lazyConnect: false,
};
/** The ioredis client `openJournalWriter` duplicates, reduced to what it uses. */
interface DuplicableRedis {
	duplicate(options: typeof JOURNAL_WRITE_OPTIONS): BlockingBusRedis & {
		once(event: "ready", listener: () => void): unknown;
	};
}

/**
 * Opens the `XADD` + `WAIT` connection and waits for `ready`: with no offline queue, a write sent
 * while the client is still `connecting` would be rejected. Rejects after `commandTimeout`.
 */
export function openJournalWriter(
	redis: DuplicableRedis
): Promise<BlockingBusRedis> {
	const writer = redis.duplicate(JOURNAL_WRITE_OPTIONS);
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			writer.disconnect();
			reject(messageManagerError("Journal write connection not ready"));
		}, JOURNAL_WRITE_OPTIONS.commandTimeout);
		writer.once("ready", () => {
			clearTimeout(timer);
			resolve(writer);
		});
	});
}
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

/** True when `err` is a Redis error whose message contains `code` (e.g. "NOGROUP"). */
export function isRedisError(err: unknown, code: string): boolean {
	return err instanceof Error && err.message.includes(code);
}

/**
 * Journal in Redis Streams (ADR-0048): one stream per topic, one consumer
 * group per subscriber service. The pending list of each group carries the
 * retry state (last attempt, number of deliveries) shared by all replicas.
 * Never `KEYS` (ADR-0023): the groups are listed from a set.
 */
export class RedisMessageJournal implements MessageJournalPort {
	private readonly _now: () => number;
	private readonly _subscribed = new Map<
		string,
		{ value: boolean; until: number }
	>();
	private readonly _readers = new Map<string, BlockingBusRedis>();
	private _writer: Promise<BlockingBusRedis> | undefined;
	private _batch: Promise<number> | undefined;

	constructor(private readonly _deps: RedisMessageJournalDeps) {
		this._now = _deps.now ?? Date.now;
	}

	/** Idempotent, never cached: a stream Redis lost loses its groups too. */
	register(group: JournalGroup): Promise<void> {
		return this._register(this._deps.redis, group);
	}

	private async _register(
		redis: Pick<BusRedis, "call" | "sadd">,
		group: JournalGroup
	): Promise<void> {
		await Promise.all([
			this._ensureGroup(redis, group),
			redis.sadd(this._groupsKey(), `${group.topic}|${group.service}`),
		]);
	}

	/** Closes the blocking connections, which ends the reads waiting on them. */
	close(): void {
		for (const reader of this._readers.values()) {
			reader.disconnect();
		}
		this._readers.clear();
		void this._writer?.then(
			(writer) => writer.disconnect(),
			() => undefined
		);
		this._writer = undefined;
	}

	async append(
		message: Message,
		services: readonly string[],
		onlyFor?: string,
		keepOnRefusal = false
	): Promise<void> {
		const { topic } = message.metadata;
		// Re-register on every append: a replica may have retired a group since, and a stream Redis lost
		// (restart without AOF) has no groups left; a group created after XADD would miss this message (ADR-0048 §1).
		const now = this._now();
		// On the connection of the WAIT, so the replicas confirm the groups with the entry.
		const writer = await this._writeRedis();
		await Promise.all(
			services.map((service) => this._register(writer, { topic, service }))
		);
		const entryId = (await writer.call(
			"XADD",
			this.stream(topic),
			"MINID",
			"~",
			String(now - JOURNAL_RETENTION_MS),
			"*",
			FIELD,
			JSON.stringify(message),
			...(onlyFor ? [ONLY_FIELD, onlyFor] : [])
		)) as string;
		const required = this._deps.minReplicas ?? 0;
		if (required > 0) {
			const replicated = await this._waitBatch(writer, required);
			if (replicated < required) {
				if (!keepOnRefusal) {
					// The publisher sends again under a new messageId: drop this entry so it is not delivered twice.
					await writer.call("XDEL", this.stream(topic), entryId);
				}
				throw Object.assign(
					messageManagerError(
						`Message not accepted: journal write held by ${replicated} of ${required} replicas`
					),
					{ waitRefused: true }
				);
			}
		}
	}

	/**
	 * One `WAIT` for every `XADD` answered in the same tick: it covers all the entries written before it
	 * on this connection. The batch closes when the `WAIT` is sent, so a later `XADD` opens the next one.
	 * A refused or failed `WAIT` reaches every caller of the batch.
	 */
	private _waitBatch(
		writer: Pick<BlockingBusRedis, "call">,
		required: number
	): Promise<number> {
		this._batch ??= Promise.resolve().then(() => {
			this._batch = undefined;
			return writer
				.call("WAIT", String(required), String(WAIT_REPLICAS_TIMEOUT_MS))
				.then(Number);
		});
		return this._batch;
	}

	/** True when a consumer group reads the topic (cached 1 s): without one a message would reach nobody. */
	async hasSubscribers(topic: string): Promise<boolean> {
		const cached = this._subscribed.get(topic);
		if (cached && cached.until > this._now()) {
			return cached.value;
		}
		let value: boolean;
		try {
			value =
				(
					(await this._deps.redis.call(
						"XINFO",
						"GROUPS",
						this.stream(topic)
					)) as unknown[]
				).length > 0;
		} catch (err) {
			if (!isRedisError(err, "no such key")) {
				throw err;
			}
			value = false;
		}
		this._subscribed.set(topic, { value, until: this._now() + 1000 });
		return value;
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
		let reply: [stream: string, entries: StreamReply][] | null;
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
				this.stream(group.topic),
				">"
			)) as typeof reply;
		} catch (err) {
			await this._recoverNoGroup(err, group);
			return [];
		}
		return this._parse(group, reply?.[0]?.[1] ?? null, () => 1);
	}

	async claimDue(
		group: JournalGroup,
		consumer: string,
		retry: { floorMs: number; dueAfterMs: (deliveries: number) => number },
		count: number,
		skip: ReadonlySet<string> = new Set()
	): Promise<JournalEntry[]> {
		const stream = this.stream(group.topic);
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
				String(count + skip.size)
			)) as typeof pending;
		} catch (err) {
			await this._recoverNoGroup(err, group);
			return [];
		}
		const due = pending
			.filter(
				([id, , idleMs, deliveries]) =>
					!skip.has(id) && idleMs >= retry.dueAfterMs(deliveries)
			)
			.slice(0, count);
		// One XCLAIM per min-idle value. MIN-IDLE makes each claim atomic: of two replicas, one wins.
		const deliveriesById = new Map(due.map(([id, , , count2]) => [id, count2]));
		const idsByMinIdle = new Map<number, string[]>();
		for (const [id, , , deliveries] of due) {
			const minIdle = retry.dueAfterMs(deliveries);
			idsByMinIdle.set(minIdle, [...(idsByMinIdle.get(minIdle) ?? []), id]);
		}
		const batches = await Promise.all(
			[...idsByMinIdle].map(async ([minIdle, ids]) => {
				const claimed = (await this._deps.redis.call(
					"XCLAIM",
					stream,
					group.service,
					consumer,
					String(minIdle),
					...ids
				)) as StreamReply;
				return this._parse(group, claimed, () => 1);
			})
		);
		// Back to the XPENDING order, each entry with its own delivery count.
		const order = [...deliveriesById.keys()];
		return batches
			.flat()
			.map((entry) => ({
				...entry,
				deliveries: (deliveriesById.get(entry.id) ?? 0) + 1,
			}))
			.sort((x1, x2) => order.indexOf(x1.id) - order.indexOf(x2.id));
	}

	/** Removes the group's consumers (dead replicas) with nothing pending and idle for `idleMs`, except `keep`. */
	async pruneConsumers(
		group: JournalGroup,
		keep: string,
		idleMs: number
	): Promise<void> {
		const stream = this.stream(group.topic);
		let rows: unknown[][];
		try {
			rows = (await this._deps.redis.call(
				"XINFO",
				"CONSUMERS",
				stream,
				group.service
			)) as unknown[][];
		} catch (err) {
			await this._recoverNoGroup(err, group);
			return;
		}
		for (const row of rows) {
			const info = toRecord(row);
			const name = String(info.name);
			if (
				name !== keep &&
				Number(info.pending) === 0 &&
				Number(info.idle) >= idleMs
			) {
				await this._deps.redis.call(
					"XGROUP",
					"DELCONSUMER",
					stream,
					group.service,
					name
				);
			}
		}
	}

	/** Lag of the groups of `service` only when given: a bus user has no right on other services' streams. */
	async lag(service?: string): Promise<JournalGroupLag[]> {
		const groups = (await this.groups()).filter(
			(group) => !service || group.service === service
		);
		const infos = new Map<string, Record<string, unknown>>();
		for (const topic of new Set(groups.map((group) => group.topic))) {
			try {
				// One call per topic lists all its groups (Redis >= 7 for `lag`).
				const reply = (await this._deps.redis.call(
					"XINFO",
					"GROUPS",
					this.stream(topic)
				)) as unknown[][];
				for (const flat of reply) {
					const info = toRecord(flat);
					infos.set(`${topic}|${info.name}`, info);
				}
			} catch (err) {
				// The stream is gone (Redis restart without AOF): nothing is pending on it.
				if (!isRedisError(err, "no such key")) {
					throw err;
				}
			}
		}
		const now = this._now();
		// One group per task: its two reads stay ordered, groups overlap.
		const results = await Promise.all(
			groups.map(async (group): Promise<JournalGroupLag | undefined> => {
				const info = infos.get(`${group.topic}|${group.service}`);
				if (!info) {
					return undefined;
				}
				const stream = this.stream(group.topic);
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
					if (isRedisError(err, "NOGROUP")) {
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
			this.stream(group.topic),
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
			// Targeted replay: the other groups see the entry too and settle it unread (not a loss).
			const forOthers =
				fields && only >= 0 && fields[only + 1] !== group.service;
			if (fields && at >= 0 && forOthers) {
				await this.ack(group, id);
			} else if (fields && at >= 0) {
				let message: Message;
				try {
					message = JSON.parse(fields[at + 1] as string) as Message;
				} catch (err) {
					// Not JSON: no `Message` to dead-letter, so it is counted, logged and acked; the others go on.
					JOURNAL_UNREADABLE_TOTAL.inc({
						topic: group.topic,
						service: group.service,
					});
					logger.error("Journal entry unreadable: dropped", {
						topic: group.topic,
						service: group.service,
						entryId: id,
						error: normalizeError(err),
					});
					await this.ack(group, id);
					continue;
				}
				entries.push({ id, message, deliveries: deliveries() });
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
		if (!isRedisError(err, "NOGROUP")) {
			throw err;
		}
		await this.register(group);
	}

	private _writeRedis(): Promise<Pick<BlockingBusRedis, "call" | "sadd">> {
		if (!this._deps.openWriteRedis) {
			return Promise.resolve(this._deps.redis);
		}
		if (!this._writer) {
			const opening = Promise.resolve(this._deps.openWriteRedis());
			// A writer that never became ready is not kept: the next append opens another.
			// biome-ignore lint/plugin: the rejection still reaches the caller through `this._writer`; this only drops the cache
			opening.catch(() => {
				if (this._writer === opening) {
					this._writer = undefined;
				}
			});
			this._writer = opening;
		}
		return this._writer;
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

	private async _ensureGroup(
		redis: Pick<BusRedis, "call" | "sadd">,
		group: JournalGroup
	): Promise<void> {
		try {
			// "$": a group sees what is written after it exists, so it must exist before the XADD.
			await redis.call(
				"XGROUP",
				"CREATE",
				this.stream(group.topic),
				group.service,
				"$",
				"MKSTREAM"
			);
		} catch (err) {
			if (!isRedisError(err, "BUSYGROUP")) {
				throw err;
			}
		}
	}

	/** Key prefix of the bus streams (`<prefix>:journal:<topic>`, `<prefix>:dead:<topic>`). */
	get keyPrefix(): string {
		return this._deps.keyPrefix;
	}

	get redis(): BusRedis {
		return this._deps.redis;
	}

	stream(topic: string): string {
		return `${this._deps.keyPrefix}:journal:${topic}`;
	}

	private _groupsKey(): string {
		return `${this._deps.keyPrefix}:journal-groups`;
	}
}
