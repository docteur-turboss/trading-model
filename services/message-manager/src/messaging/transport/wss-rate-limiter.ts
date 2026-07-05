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
		const now = Date.now();
		let entry = this._windows.get(serviceName);
		if (!entry) {
			entry = { timestamps: new Deque<number>(), lastSeen: now };
			this._windows.set(serviceName, entry);
		}

		entry.lastSeen = now;
		const { timestamps } = entry;
		const cutoff = now - RATE_LIMIT_WINDOW_MS;
		while (timestamps.length > 0 && timestamps.peekFront()! < cutoff) {
			timestamps.shift();
		}

		if (timestamps.length >= RATE_LIMIT_MAX_PER_WINDOW) {
			return false;
		}

		timestamps.push(now);
		return true;
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
		this._cleanupTimer = setInterval(() => {
			const now = Date.now();
			const cutoff = now - RATE_LIMIT_WINDOW_MS;
			const staleCutoff = now - STALE_MS;
			for (const [key, entry] of this._windows) {
				const { timestamps } = entry;
				while (timestamps.length > 0 && timestamps.peekFront()! < cutoff) {
					timestamps.shift();
				}
				if (timestamps.length === 0 && entry.lastSeen < staleCutoff) {
					this._windows.delete(key);
				}
			}
		}, RATE_LIMIT_CLEANUP_INTERVAL_MS);
		this._cleanupTimer.unref();
	}

	shutdown(): void {
		if (this._cleanupTimer) {
			clearInterval(this._cleanupTimer);
			this._cleanupTimer = null;
		}
		this._windows.clear();
	}
}
