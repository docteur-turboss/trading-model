import type { Message } from "@trading-model/contracts/message-types";
import type {
	JournalEntry,
	JournalGroup,
	MessageJournalPort,
} from "../../application/ports/message-journal-port";

interface Pending {
	lastAttemptAt: number;
	deliveries: number;
}

interface GroupState {
	/** Next position in the topic's log this group has not read. */
	next: number;
	pending: Map<number, Pending>;
}

const keyOf = ({ topic, service }: JournalGroup) => `${topic}|${service}`;

/**
 * Journal kept in the process memory: dev, tests and a single replica without
 * Redis. Lost on restart; production requires Redis (`RedisMessageJournal`).
 */
export class InMemoryMessageJournal implements MessageJournalPort {
	private readonly _logs = new Map<string, Message[]>();
	private readonly _groups = new Map<string, GroupState>();
	private readonly _known = new Map<string, JournalGroup>();
	/** Blocked reads, woken by an append or by `close`. */
	private readonly _waiters = new Set<() => void>();

	constructor(private readonly _now: () => number = Date.now) {}

	register(group: JournalGroup): Promise<void> {
		if (!this._groups.has(keyOf(group))) {
			this._groups.set(keyOf(group), {
				next: this._log(group.topic).length,
				pending: new Map(),
			});
			this._known.set(keyOf(group), group);
		}
		return Promise.resolve();
	}

	async append(message: Message, services: readonly string[]): Promise<void> {
		const { topic } = message.metadata;
		for (const service of services) {
			await this.register({ topic, service });
		}
		this._log(topic).push(message);
		this.close();
	}

	/** Wakes the blocked reads (they re-read, or return empty when stopped). */
	close(): void {
		for (const wake of [...this._waiters]) {
			wake();
		}
	}

	groups(): Promise<JournalGroup[]> {
		return Promise.resolve([...this._known.values()]);
	}

	async readNew(
		group: JournalGroup,
		_consumer: string,
		count: number,
		blockMs?: number
	): Promise<JournalEntry[]> {
		const entries = this._take(group, count);
		if (entries.length > 0 || !blockMs) {
			return entries;
		}
		await new Promise<void>((resolve) => {
			const wake = () => {
				clearTimeout(timer);
				this._waiters.delete(wake);
				resolve();
			};
			const timer = setTimeout(wake, blockMs);
			this._waiters.add(wake);
		});
		return this._take(group, count);
	}

	private _take(group: JournalGroup, count: number): JournalEntry[] {
		const state = this._groups.get(keyOf(group));
		const log = this._log(group.topic);
		const entries: JournalEntry[] = [];
		while (state && state.next < log.length && entries.length < count) {
			const position = state.next++;
			state.pending.set(position, {
				lastAttemptAt: this._now(),
				deliveries: 1,
			});
			entries.push(this._entry(log, position, 1));
		}
		return entries;
	}

	claimDue(
		group: JournalGroup,
		_consumer: string,
		retry: { floorMs: number; dueAfterMs: (deliveries: number) => number },
		count: number
	): Promise<JournalEntry[]> {
		const log = this._log(group.topic);
		const entries: JournalEntry[] = [];
		const pending = this._groups.get(keyOf(group))?.pending ?? new Map();
		for (const [position, entry] of pending) {
			const idle = this._now() - entry.lastAttemptAt;
			if (
				entries.length < count &&
				idle >= retry.floorMs &&
				idle >= retry.dueAfterMs(entry.deliveries)
			) {
				entry.lastAttemptAt = this._now();
				entry.deliveries += 1;
				entries.push(this._entry(log, position, entry.deliveries));
			}
		}
		return Promise.resolve(entries);
	}

	ack(group: JournalGroup, id: string): Promise<void> {
		this._groups.get(keyOf(group))?.pending.delete(Number(id));
		return Promise.resolve();
	}

	private _log(topic: string): Message[] {
		let log = this._logs.get(topic);
		if (!log) {
			log = [];
			this._logs.set(topic, log);
		}
		return log;
	}

	private _entry(
		log: Message[],
		position: number,
		deliveries: number
	): JournalEntry {
		return {
			id: String(position),
			message: log[position] as Message,
			deliveries,
		};
	}
}
