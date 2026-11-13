import { getLogger } from "@trading-model/contracts/logger-registry";
import type { LeaderLeasePort } from "./leader-lease.port";

/** The work that must run on one instance only (collector crons, training loop). */
export interface LeaderJob {
	start(): void;
	/** Stops scheduling, then waits for the work in flight to end. */
	stop(): Promise<void>;
}

export interface LeadershipTiming {
	/** Delay between two acquire/renew attempts. */
	retryMs: number;
	/**
	 * A leader that could not renew for this long stops the job. Below the
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
 * Runs the job only while this instance holds the leader lease (ADR-0057
 * collector, ADR-0058 trainer): starts it on acquisition, stops it when the
 * lease is lost or cannot be renewed within the deadline. On stop, the job
 * drains first, then the lease is released for the successor.
 * `onLeaderChange` receives 1 when leading and 0 otherwise (the service's
 * Prometheus gauge); `label` ("Collector", "Trainer") prefixes the logs.
 */
export class Leadership {
	private _leading = false;
	private _stopped = false;
	private _timer?: NodeJS.Timeout;
	/** Fires `renewDeadlineMs` after the start of the last successful attempt. */
	private _deadline?: NodeJS.Timeout;
	private _tick?: Promise<void>;
	private _draining?: Promise<void>;

	constructor(
		private readonly _lease: LeaderLeasePort,
		private readonly _job: LeaderJob,
		private readonly _onLeaderChange: (leader: 0 | 1) => void,
		private readonly _label: string,
		private readonly _timing: LeadershipTiming = DEFAULT_LEADERSHIP_TIMING,
		private readonly _now: () => number = Date.now
	) {}

	/** True while this instance runs the job. */
	get leading(): boolean {
		return this._leading;
	}

	/** First attempt now, then every `retryMs`. */
	start(): void {
		this._onLeaderChange(0);
		this._schedule(0);
	}

	/** Stops trying, stops the job and drains it, then releases the lease. */
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
		this._onLeaderChange(0);
		await this._job.stop();
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
			getLogger().warn(`${this._label} lease unreachable`, { error: err });
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
				this._onLeaderChange(1);
				getLogger().info(`${this._label} lease acquired: running`);
				this._job.start();
			}
			return;
		}
		if (this._leading && held === false) {
			await this._lose("lease held by another instance");
		}
	}

	/**
	 * Stops the job at once. Called from the deadline timer too, so it
	 * never waits on the API call in flight: the stop is bounded by real time.
	 */
	private _lose(reason: string): Promise<void> {
		clearTimeout(this._deadline);
		this._leading = false;
		this._onLeaderChange(0);
		getLogger().warn(`${this._label} stops its job`, { reason });
		this._draining = this._job
			.stop()
			.catch((err: unknown) => {
				getLogger().error(`${this._label} stop failed after losing the lease`, {
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
			getLogger().info(`${this._label} lease released`);
		} catch (err) {
			// The rest of the shutdown goes on: the successor waits for the expiry.
			getLogger().error(
				`${this._label} lease not released: it expires on its own`,
				{ error: err }
			);
		}
	}
}

/** Always held: the job of a single-instance deployment (compose, dev). */
export const SOLE_INSTANCE_LEASE: LeaderLeasePort = {
	tryAcquireOrRenew: async () => true,
	release: async () => {
		// Intentional no-op.
	},
};
