import type { BusRedis } from "../../src/bus/redis-journal";

interface Group {
	last: number;
	pending: Map<string, { consumer: string; deliveries: number }>;
}
interface Stream {
	entries: [id: string, fields: string[]][];
	groups: Map<string, Group>;
}

/** The Redis Streams commands of the bus, in memory (blocking reads wait 10 ms). */
export class StreamRedis implements BusRedis {
	readonly streams = new Map<string, Stream>();
	readonly sets = new Map<string, Set<string>>();
	private _seq = 0;
	/** Commands to fail, by name: the next call of each throws this error. */
	readonly failures = new Map<string, Error>();
	/** Number of next WAIT calls answered with 0 replicas. */
	waitRefusals = 0;

	async sadd(key: string, ...members: string[]): Promise<number> {
		const set = this.sets.get(key) ?? new Set<string>();
		for (const member of members) {
			set.add(member);
		}
		this.sets.set(key, set);
		return members.length;
	}

	async smembers(key: string): Promise<string[]> {
		return [...(this.sets.get(key) ?? [])];
	}

	async srem(key: string, ...members: string[]): Promise<number> {
		const set = this.sets.get(key);
		let removed = 0;
		for (const member of members) {
			if (set?.delete(member)) {
				removed++;
			}
		}
		return removed;
	}

	multi() {
		const queued: [string, string[]][] = [];
		const tx = {
			call: (command: string, ...args: string[]) => {
				queued.push([command, args]);
				return tx;
			},
			exec: async (): Promise<[Error | null, unknown][] | null> => {
				const results: [Error | null, unknown][] = [];
				for (const [command, args] of queued) {
					try {
						results.push([null, await this.call(command, ...args)]);
					} catch (err) {
						results.push([err as Error, undefined]);
					}
				}
				return results;
			},
		};
		return tx;
	}

	async call(command: string, ...args: string[]): Promise<unknown> {
		const failure = this.failures.get(command);
		if (failure) {
			this.failures.delete(command);
			throw failure;
		}
		const [key = "", ...rest] = args;
		switch (command) {
			case "EXISTS":
				return this.streams.has(key) ? 1 : 0;
			case "WAIT":
				return this.waitRefusals-- > 0 ? 0 : Number(key);
			case "XINFO":
				if (key === "STREAM") {
					const stream = this.streams.get(rest[0] as string);
					if (!stream) {
						throw new Error("ERR no such key");
					}
					return ["length", stream.entries.length];
				}
				return this._info(rest[0] as string);
			case "XGROUP":
				return this._createGroup(rest[0] as string, rest[1] as string);
			case "XADD":
				return this._add(key, rest);
			case "XREADGROUP":
				return this._read(args);
			case "XPENDING":
				return this._pending(key, rest);
			case "XCLAIM":
				return this._claim(key, rest);
			case "XACK":
				this._stream(key)
					.groups.get(rest[0] as string)
					?.pending.delete(rest[1] as string);
				return 1;
			case "XRANGE":
				return this._range(key, rest);
			case "XDEL":
				return this._del(key, rest[0] as string);
			default:
				throw new Error(`unsupported ${command}`);
		}
	}

	private _stream(key: string): Stream {
		let stream = this.streams.get(key);
		if (!stream) {
			stream = { entries: [], groups: new Map() };
			this.streams.set(key, stream);
		}
		return stream;
	}

	private _info(key: string): unknown[] {
		const stream = this.streams.get(key);
		if (!stream) {
			throw new Error("ERR no such key");
		}
		return [...stream.groups.keys()].map((name) => ["name", name]);
	}

	private _createGroup(key: string, group: string): string {
		const stream = this._stream(key);
		if (stream.groups.has(group)) {
			throw new Error("BUSYGROUP Consumer Group name already exists");
		}
		stream.groups.set(group, { last: this._seq, pending: new Map() });
		return "OK";
	}

	private _add(key: string, rest: string[]): string {
		const at = rest.indexOf("*");
		const id = `${++this._seq}-0`;
		this._stream(key).entries.push([id, rest.slice(at + 1)]);
		return id;
	}

	private _read(args: string[]): unknown {
		const [, group = "", consumer = ""] = args;
		const count = Number(args[args.indexOf("COUNT") + 1]);
		const key = args[args.indexOf("STREAMS") + 1] as string;
		const state = this.streams.get(key)?.groups.get(group);
		if (!state) {
			throw new Error("NOGROUP No such consumer group");
		}
		const fresh = this._stream(key)
			.entries.filter(([id]) => Number.parseInt(id, 10) > state.last)
			.slice(0, count);
		for (const [id] of fresh) {
			state.last = Number.parseInt(id, 10);
			state.pending.set(id, { consumer, deliveries: 1 });
		}
		if (fresh.length === 0) {
			return args.includes("BLOCK")
				? new Promise((resolve) => setTimeout(() => resolve(null), 10))
				: null;
		}
		return [key, fresh];
	}

	private _pending(key: string, rest: string[]): unknown {
		const pending = this.streams
			.get(key)
			?.groups.get(rest[0] as string)?.pending;
		const ids = [...(pending?.keys() ?? [])];
		if (rest.length === 1) {
			return [ids.length, ids[0] ?? null, ids[ids.length - 1] ?? null, null];
		}
		// Idle far above any retry delay: every pending entry is due.
		return ids.map((id) => [
			id,
			pending?.get(id)?.consumer,
			1e9,
			pending?.get(id)?.deliveries,
		]);
	}

	private _claim(key: string, rest: string[]): unknown {
		const [group = "", consumer = "", , ...ids] = rest;
		for (const id of ids) {
			const entry = this._stream(key).groups.get(group)?.pending.get(id);
			if (entry) {
				entry.consumer = consumer;
				entry.deliveries += 1;
			}
		}
		return ids.flatMap((id) => this._range(key, [id, id]) as unknown[]);
	}

	private _range(key: string, rest: string[]): unknown {
		const [from = "-", to = "+"] = rest;
		return (this.streams.get(key)?.entries ?? []).filter(
			([id]) => (from === "-" || id >= from) && (to === "+" || id <= to)
		);
	}

	private _del(key: string, id: string): number {
		const stream = this.streams.get(key);
		const before = stream?.entries.length ?? 0;
		if (stream) {
			stream.entries = stream.entries.filter(([entry]) => entry !== id);
		}
		return before - (stream?.entries.length ?? 0);
	}
}
