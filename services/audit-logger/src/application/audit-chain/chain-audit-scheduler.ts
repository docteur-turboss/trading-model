import { TimerHandle } from "@trading-model/common/utils/timer-handle";
import { getLogger } from "@trading-model/contracts/logger-registry";
import { DurationMs } from "@trading-model/primitives/primitives";
import type { ChainAudit } from "./chain-audit";

/** First cycle shortly after start: a restarted pod reports at once. */
const FIRST_CYCLE_DELAY_MS = DurationMs.of(5000);

/**
 * Runs a verification + anchoring cycle every `intervalMs`, one at a time.
 * Every replica runs it: the checks are read-only and an anchor written twice
 * is the same object, so no coordination is needed.
 */
export class ChainAuditScheduler {
	private readonly _first = new TimerHandle();
	private readonly _every = new TimerHandle();
	private _running: Promise<void> | null = null;

	constructor(
		private readonly _audit: ChainAudit,
		private readonly _intervalMs: DurationMs
	) {}

	start(): void {
		this._first.startTimeout(() => void this.runOnce(), FIRST_CYCLE_DELAY_MS);
		this._every.startInterval(() => void this.runOnce(), this._intervalMs);
	}

	/** Runs a cycle unless one is still going; never throws. */
	runOnce(): Promise<void> {
		this._running ??= this._cycle().finally(() => {
			this._running = null;
		});
		return this._running;
	}

	stop(): void {
		this._first.stop();
		this._every.stop();
	}

	private async _cycle(): Promise<void> {
		try {
			await this._audit.runCycle();
		} catch (err) {
			getLogger().error("Audit chain cycle failed", {
				error: (err as Error)?.message,
			});
		}
	}
}
