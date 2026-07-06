import type WebSocket from "ws";
import { Deque } from "./deque";

interface RateLimitEntry {
	timestamps: Deque<number>;
	lastSeen: number;
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_PER_WINDOW = 10000;
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 60_000;
const STALE_MS = 120_000;

export class WssRateLimiter {
	private _windows = new Map<string, RateLimitEntry>();
	private _cleanupTimer: ReturnType<typeof setInterval> | null = null;

	check(serviceName: string): boolean {
		const entry = this._getOrCreateEntry(serviceName);
		this._pruneOldTimestamps(entry);

		if (entry.timestamps.length >= RATE_LIMIT_MAX_PER_WINDOW) {
			return false;
		}

		entry.timestamps.push(Date.now());
		return true;
	}

	private _getOrCreateEntry(serviceName: string): RateLimitEntry {
		const now = Date.now();
		let entry = this._windows.get(serviceName);
		if (!entry) {
			entry = { timestamps: new Deque<number>(), lastSeen: now };
			this._windows.set(serviceName, entry);
		}
		entry.lastSeen = now;
		return entry;
	}

	private _pruneOldTimestamps(entry: RateLimitEntry): void {
		const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
		while (entry.timestamps.length > 0 && entry.timestamps.peekFront()! < cutoff) {
			entry.timestamps.shift();
		}
	}

	checkAndReject(serviceName: string, ws: WebSocket): boolean {
		if (this.check(serviceName)) {
			return true;
		}
		ws.send(JSON.stringify({ type: "error", message: "Rate limit exceeded" }));
		return false;
	}

	ensureCleanupTimer(): void {
		if (this._cleanupTimer) {
			return;
		}
		this._cleanupTimer = setInterval(() => this._cleanupWindows(), RATE_LIMIT_CLEANUP_INTERVAL_MS);
		this._cleanupTimer.unref();
	}

	private _cleanupWindows(): void {
		const now = Date.now();
		const cutoff = now - RATE_LIMIT_WINDOW_MS;
		const staleCutoff = now - STALE_MS;
		for (const [key, entry] of this._windows) {
			this._pruneEntryTimestamps(entry, cutoff);
			if (entry.timestamps.length === 0 && entry.lastSeen < staleCutoff) {
				this._windows.delete(key);
			}
		}
	}

	private _pruneEntryTimestamps(entry: RateLimitEntry, cutoff: number): void {
		while (entry.timestamps.length > 0 && entry.timestamps.peekFront()! < cutoff) {
			entry.timestamps.shift();
		}
	}

	shutdown(): void {
		if (this._cleanupTimer) {
			clearInterval(this._cleanupTimer);
			this._cleanupTimer = null;
		}
		this._windows.clear();
	}
}
