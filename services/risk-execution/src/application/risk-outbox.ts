import { normalizeError } from "@trading-model/common/utils/errors";
import { getLogger } from "@trading-model/contracts/logger-registry";
import type { RiskEvent } from "@trading-model/contracts/risk-events";
import type { StatePort } from "../domain/ports";

export interface PendingRiskEvent {
	topic: RiskEvent;
	fields: Record<string, unknown>;
}

export interface RiskOutboxDeps {
	/** File that keeps the waiting events across restarts. */
	store: StatePort<PendingRiskEvent[]>;
	/** Posts one event on the bus; rejects when the bus refuses it. */
	send: (entry: PendingRiskEvent) => Promise<void>;
	setPending: (depth: number) => void;
	onDropped: () => void;
}

/** Bound of the waiting file: the oldest event is dropped (and logged) beyond it. */
const MAX_PENDING = 1000;

/**
 * Keeps the risk audit events the bus refused and replays them in order.
 * Changes run one at a time: the file is rewritten whole.
 */
export class RiskOutbox {
	private _pending: PendingRiskEvent[] = [];
	private _chain: Promise<void> = Promise.resolve();

	constructor(private readonly _deps: RiskOutboxDeps) {}

	/**
	 * Loads the events kept by a previous run and replays them. Throws when the
	 * file cannot be read: starting on an empty queue would overwrite it.
	 */
	async init(): Promise<void> {
		this._pending = (await this._deps.store.load()) ?? [];
		this._deps.setPending(this._pending.length);
		await this.replay();
	}

	/** Replays the waiting events (startup, tick); never throws. */
	replay(): Promise<void> {
		return this._serial(() => this._drain());
	}

	/**
	 * Posts an event; a refused one is kept and replayed with the same payload.
	 * Never throws and does not make the caller wait for the bus.
	 */
	publish(entry: PendingRiskEvent): void {
		this._deps
			.send(entry)
			.then(
				() => (this._pending.length > 0 ? this.replay() : undefined),
				(error: unknown) => {
					getLogger().error("risk event not published: kept in the outbox", {
						topic: entry.topic,
						fields: entry.fields,
						error: normalizeError(error),
					});
					return this._serial(() => this._enqueue(entry));
				}
			)
			.catch((error: unknown) =>
				getLogger().error("risk outbox publish failed", {
					error: normalizeError(error),
				})
			);
	}

	private _serial(task: () => Promise<void>): Promise<void> {
		this._chain = this._chain.then(task).catch((error: unknown) =>
			getLogger().error("risk outbox failed", {
				error: normalizeError(error),
			})
		);
		return this._chain;
	}

	private async _drain(): Promise<void> {
		const before = this._pending.length;
		while (this._pending[0]) {
			try {
				await this._deps.send(this._pending[0]);
			} catch (error) {
				getLogger().warn("risk outbox replay stopped", {
					pending: this._pending.length,
					error: normalizeError(error),
				});
				break;
			}
			this._pending.shift();
			this._deps.setPending(this._pending.length);
		}
		if (this._pending.length !== before) {
			await this._deps.store.save(this._pending);
		}
	}

	private async _enqueue(entry: PendingRiskEvent): Promise<void> {
		this._pending.push(entry);
		if (this._pending.length > MAX_PENDING) {
			this._deps.onDropped();
			getLogger().error("risk outbox full: oldest event dropped", {
				dropped: this._pending.shift(),
			});
		}
		this._deps.setPending(this._pending.length);
		getLogger().warn("risk event kept for replay", {
			pending: this._pending.length,
		});
		await this._deps.store.save(this._pending);
	}
}
