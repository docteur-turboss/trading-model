import { logger } from "@trading-model/common/config/logger";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";

import type { AuditEntry } from "./audit-store";

export class AuditBuffer {
	private readonly _pendingEntries: AuditEntry[] = [];
	private readonly _flushTimer = new TimerHandle();
	private readonly _maxBuffer: number;
	private readonly _flushIntervalMs: number;
	readonly batchSize: number;

	constructor(maxBuffer = 5000, batchSize = 200, flushIntervalMs = 5000) {
		this._maxBuffer = maxBuffer;
		this.batchSize = batchSize;
		this._flushIntervalMs = flushIntervalMs;
	}

	get pendingCount(): number {
		return this._pendingEntries.length;
	}

	buffer(entry: AuditEntry): void {
		if (this._pendingEntries.length >= this._maxBuffer) {
			const dropped = this._pendingEntries.shift()!;
			logger.warn("AuditStore: buffer full, dropping oldest entry", {
				context: {
					action: dropped.action,
					serialNumber: dropped.serialNumber,
				},
			});
		}
		this._pendingEntries.push(entry);
	}

	start(flushFn: () => Promise<void>): void {
		this._flushTimer.startInterval(flushFn, this._flushIntervalMs);
		this._flushTimer.unref();
	}

	stop(): void {
		this._flushTimer.stop();
	}

	drain(): AuditEntry[] {
		return this._pendingEntries.splice(0, this.batchSize);
	}

	rebuffer(entries: AuditEntry[], err: unknown): void {
		this._pendingEntries.unshift(...entries);
		if (this._pendingEntries.length > this._maxBuffer) {
			const dropped = this._pendingEntries.splice(this._maxBuffer);
			logger.warn("AuditStore: flush failed, dropped entries", {
				context: { count: dropped.length, err },
			});
		} else {
			logger.error("AuditStore: flush failed, entries re-buffered", {
				context: { count: entries.length, err },
			});
		}
	}
}
