import { getLogger } from "@trading-model/contracts/logger-registry";
import { TRAINING_LEADER } from "../config/metrics";
import type { LeaderLeasePort } from "../domain/ports/leader-lease.port";

/** The training loop: it must run on one instance only. */
export interface Training {
	start(): void;
	/** Stops scheduling, ends the session in flight early, stores and publishes its model. */
	stop(): Promise<void>;
}

export interface LeadershipTiming {
	/** Delay between two acquire/renew attempts. */
	retryMs: number;
	/**
	 * A leader that could not renew for this long stops training. Below the
	 * lease duration, so it stops before a successor may take the lease.
	 */
	renewDeadlineMs: number;
}

/** client-go's defaults, with LEASE_DURATION_SECONDS = 15. */
export const DEFAULT_LEADERSHIP_TIMING: LeadershipTiming = {
	retryMs: 2000,
	renewDeadlineMs: 10_000,
};

/**
 * Runs the training loop only while this instance holds the leader lease
 * (ADR-0058, as ADR-0057 for the collector): starts it on acquisition, stops
 * it when the lease is lost or cannot be renewed within the deadline. On stop,
 * the training ends and stores its model first, then the lease is released
 * for the successor.
 */
export class TrainingLeadership {
	private _leading = false;
	private _stopped = false;
	private _timer?: NodeJS.Timeout;
	/** Fires `renewDeadlineMs` after the start of the last successful attempt. */
	private _deadline?: NodeJS.Timeout;
	private _tick?: Promise<void>;
	private _draining?: Promise<void>;

	constructor(
		private readonly _lease: LeaderLeasePort,
		private readonly _training: Training,
		private readonly _timing: LeadershipTiming = DEFAULT_LEADERSHIP_TIMING,
		private readonly _now: () => number = Date.now
	) {}

	/** True while this instance trains. */
	get leading(): boolean {
		return this._leading;
	}

	/** First attempt now, then every `retryMs`. */
	start(): void {
		TRAINING_LEADER.set(0);
		this._schedule(0);
	}

	/** Stops trying, ends the training and stores its model, then releases the lease. */
	async stop(): Promise<void> {
		this._stopped = true;
		clearTimeout(this._timer);
		await this._tick;
		await this._draining;
		if (!this._leading) {
			return;
		}
		clearTimeout(this._deadline);
		this._leading = false;
		TRAINING_LEADER.set(0);
		await this._training.stop();
		await this._release();
	}

	private _schedule(delayMs: number): void {
		this._timer = setTimeout(() => {
			this._tick = this._attempt().finally(() => {
				this._tick = undefined;
				if (!this._stopped) {
					this._schedule(this._timing.retryMs);
				}
			});
		}, delayMs);
	}

	private async _attempt(): Promise<void> {
		if (this._draining !== undefined) {
			// Leadership was lost by the deadline: finish that drain before trying again.
			await this._draining;
			return;
		}
		// The write may have landed as early as this: renewals count from here.
		const startedAt = this._now();
		let held: boolean | undefined;
		try {
			held = await this._lease.tryAcquireOrRenew();
		} catch (err) {
			getLogger().warn("Trainer lease unreachable", { error: err });
		}
		if (this._stopped) {
			if (held && !this._leading) {
				await this._release();
			}
			return;
		}
		if (held) {
			const deadlineIn = startedAt + this._timing.renewDeadlineMs - this._now();
			if (deadlineIn <= 0) {
				return; // Answered too late to count; the deadline timer stops a leader.
			}
			clearTimeout(this._deadline);
			this._deadline = setTimeout(() => {
				// Never rejects: _lose logs a failed drain.
				void this._lose("lease not renewed within the deadline");
			}, deadlineIn);
			if (!this._leading) {
				this._leading = true;
				TRAINING_LEADER.set(1);
				getLogger().info("Trainer lease acquired: training");
				this._training.start();
			}
			return;
		}
		if (this._leading && held === false) {
			await this._lose("lease held by another instance");
		}
	}

	/**
	 * Stops training at once. Called from the deadline timer too, so it
	 * never waits on the API call in flight: the stop is bounded by real time.
	 */
	private _lose(reason: string): Promise<void> {
		clearTimeout(this._deadline);
		this._leading = false;
		TRAINING_LEADER.set(0);
		getLogger().warn("Trainer stops training", { reason });
		this._draining = this._training
			.stop()
			.catch((err: unknown) => {
				getLogger().error("Trainer stop failed after losing the lease", {
					error: err,
				});
			})
			.finally(() => {
				this._draining = undefined;
			});
		return this._draining;
	}

	private async _release(): Promise<void> {
		try {
			await this._lease.release();
			getLogger().info("Trainer lease released");
		} catch (err) {
			// The rest of the shutdown goes on: the successor waits for the expiry.
			getLogger().error("Trainer lease not released: it expires on its own", {
				error: err,
			});
		}
	}
}

/** Always held: the trainer of a single-instance deployment (compose, dev). */
export const SOLE_INSTANCE_LEASE: LeaderLeasePort = {
	tryAcquireOrRenew: async () => true,
	release: async () => {
		// Intentional no-op.
	},
};
