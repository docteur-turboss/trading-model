import { getLogger } from "@trading-model/contracts/logger-registry";
import { SIGNAL_SOURCE_QUARANTINED } from "../config/metrics";

const MAX_BACKOFF_MS = 24 * 3_600_000;

interface Entry {
	failures: number;
	/** Quarantines opened so far: the back-off doubles with each. */
	opened: number;
	until: number;
}

/** Where the open deadlines (epoch ms per source) outlive the process. */
export interface QuarantineStore {
	load(): Promise<Record<string, number>>;
	save(until: Record<string, number>): Promise<void>;
}

/**
 * Quarantine of external sources, shared by the signal sources and Binance.
 * `threshold` failures in a row, or one with a `minDelayMs`, open it until
 * `now + max(backoff, minDelayMs)`; the backoff doubles from `baseMs` to 24 h.
 * The first call after the deadline is the trial: `clear` closes the
 * quarantine, `fail` extends it. Without a `store` a restart clears it; with
 * one, `restore()` reads the deadlines back (a leader change keeps a ban).
 */
export class SourceQuarantine {
	private readonly _entries = new Map<string, Entry>();

	constructor(
		private readonly _baseMs: number,
		private readonly _threshold: number,
		private readonly _now: () => number = () => Date.now(),
		private readonly _store?: QuarantineStore
	) {}

	/** Reopens the quarantines the store still holds; never shortens one. */
	async restore(): Promise<void> {
		const saved = (await this._store?.load()) ?? {};
		for (const [key, until] of Object.entries(saved)) {
			const entry = this._entries.get(key);
			if (until > (entry?.until ?? 0)) {
				this._entries.set(key, {
					failures: entry?.failures ?? 0,
					opened: Math.max(1, entry?.opened ?? 0),
					until,
				});
				SIGNAL_SOURCE_QUARANTINED.set({ source: key }, 1);
			}
		}
	}

	private _persist(): void {
		const until: Record<string, number> = {};
		for (const [key, entry] of this._entries) {
			until[key] = entry.until;
		}
		this._store?.save(until).catch((error: unknown) => {
			getLogger().error("Source quarantine not saved", { error });
		});
	}

	isOpen(key: string): boolean {
		return this._now() < (this._entries.get(key)?.until ?? 0);
	}

	/** Records a failed call. Ignored while open (concurrent calls of one cycle). */
	fail(key: string, minDelayMs: number): void {
		const now = this._now();
		const previous = this._entries.get(key);
		if (previous && now < previous.until) {
			return;
		}
		const failures = (previous?.failures ?? 0) + 1;
		if (minDelayMs === 0 && failures < this._threshold) {
			this._entries.set(key, {
				failures,
				opened: previous?.opened ?? 0,
				until: 0,
			});
			return;
		}
		const opened = (previous?.opened ?? 0) + 1;
		const backoff = Math.min(MAX_BACKOFF_MS, this._baseMs * 2 ** (opened - 1));
		const until = now + Math.max(backoff, minDelayMs);
		this._entries.set(key, { failures, opened, until });
		SIGNAL_SOURCE_QUARANTINED.set({ source: key }, 1);
		this._persist();
		getLogger().warn("Source quarantined", {
			context: { source: key, failures, until: new Date(until).toISOString() },
		});
	}

	/** Records a call that did not fail: closes the quarantine. */
	clear(key: string): void {
		if (this.isOpen(key)) {
			return;
		}
		if (this._entries.delete(key)) {
			this._persist();
		}
		SIGNAL_SOURCE_QUARANTINED.set({ source: key }, 0);
	}
}
