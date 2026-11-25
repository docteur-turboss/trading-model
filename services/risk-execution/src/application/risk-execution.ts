import { withTimeout } from "@trading-model/common/utils/retry";
import type { Intent, Order } from "@trading-model/contracts/order-intent";
import { DurationMs } from "@trading-model/primitives/primitives";
import {
	applyFill,
	type KillTarget,
	limitBreaches,
	reconciliationDiffs,
	rollDay,
} from "../domain/accounting";
import type { RiskLimits } from "../domain/limits";
import { FINAL, transition } from "../domain/order";
import type {
	AdmissionPort,
	BrokerAccount,
	BrokerOrderView,
	BrokerPort,
	MarketPrice,
	PricePort,
	StatePort,
} from "../domain/ports";
import {
	dailyLoss,
	marketableLimit,
	preTradeReject,
} from "../domain/pre-trade";
import {
	equity,
	exposure,
	isOpen,
	newState,
	type RiskState,
	SEEN_HORIZON_MS,
} from "../domain/state";

export interface RiskExecutionDeps {
	limits: RiskLimits;
	broker: BrokerPort;
	store: StatePort<RiskState>;
	admission: AdmissionPort;
	/** The only source of the marks, the price age and the price checks (ADR-0064 §7). */
	prices: PricePort;
	mode: "paper" | "live";
	/** Only this actor re-arms after the drawdown stop (policy §4.4). */
	ownerActor: string;
	now?: () => number;
	/** Every transition, engagement and rejection, with the mode (audit trail, ADR-0064 §3). */
	emit?: (event: string, fields: Record<string, unknown>) => void;
}

export interface IntentResult {
	status: Order["status"];
	clientOrderId: string;
	/** Reason code when `status` is `rejected`. */
	reason?: string;
}

const RECONCILE_EVERY_MS = 300_000;
function targetStatus(order: Order, view: BrokerOrderView): Order["status"] {
	switch (view.status) {
		case "filled":
			return "filled";
		case "rejected":
			return "broker_rejected";
		case "cancelled":
			return "cancelled";
		default:
			if (view.filledQty > 0) {
				return "partially_filled";
			}
			// still open at the broker: no way back to acknowledged (ADR-0064 §3)
			return order.status === "cancel_requested"
				? order.status
				: "acknowledged";
	}
}

/** Operator view served by the status route. */
export interface StatusReport {
	mode: "paper" | "live";
	ready: boolean;
	mismatch: boolean;
	killSwitch: RiskState["killSwitch"];
	equity: number;
	/** Drawdown from the high-water mark over its limit (drawdownPct × allocatedCapital): 1 = limit. */
	drawdownRatio: number;
	exposureRatio: number;
	dailyLoss: number;
	openOrders: number;
	positions: RiskState["positions"];
	oldestPriceAgeSeconds: number;
}

/** The Risk/Execution context of ADR-0064: the only owner of the order flow. */
/** A business refusal of `rearm` (answered 403), as opposed to a failure (5xx). */
export class RearmRefusedError extends Error {}

export class RiskExecution {
	private _state!: RiskState;
	private _ready = false;
	private _broken = false;
	/** True when the last reconciliation found differences (not when the broker was unreachable). */
	private _mismatch = false;
	private _lastReconcile = 0;
	private _tail: Promise<unknown> = Promise.resolve();
	private _ticking?: Promise<void>;
	private readonly _now: () => number;

	constructor(private readonly _d: RiskExecutionDeps) {
		this._now = _d.now ?? Date.now;
	}

	/** Runs one operation at a time: a single replica owns the state. */
	private _run<Result>(fn: () => Promise<Result>): Promise<Result> {
		const result = this._tail.then(fn);
		// biome-ignore lint/plugin: the error reaches the caller through `result`; the chain only keeps going
		this._tail = result.catch(() => undefined);
		return result;
	}

	/** Every call out of the service has a deadline: none holds the queue without bound. */
	private _bounded<Result>(
		call: Promise<Result>,
		what: string
	): Promise<Result> {
		const ms = this._d.limits.submitTimeoutMs;
		return withTimeout(
			call,
			DurationMs.of(ms),
			`${what} timeout after ${ms} ms`
		);
	}

	/**
	 * Loads the state, finishes interrupted orders, then reconciles. Fail closed:
	 * unreadable, global switch on for good; missing (first install or lost
	 * volume, indistinguishable), global switch on until an operator re-arms.
	 */
	start(): Promise<void> {
		return this._run(async () => {
			const now = this._now();
			try {
				const loaded = await this._d.store.load();
				this._state = loaded ?? newState(this._d.limits.allocatedCapital, now);
				if (!loaded) {
					await this._engage(null, "state_missing");
				}
			} catch (error) {
				this._broken = true;
				this._state = newState(this._d.limits.allocatedCapital, now);
				this._state.killSwitch.global = "state_unreadable";
				this._emit("kill_switch.engaged", {
					scope: "global",
					reason: "state_unreadable",
					error: String(error),
				});
				return;
			}
			const orders = Object.values(this._state.orders);
			for (const order of orders) {
				if (order.status === "submitted" || order.status === "unknown") {
					await this._resolve(order);
				}
			}
			await this._reconcile();
			const ks = this._state.killSwitch;
			for (const order of orders.filter(
				(order) => order.status === "accepted"
			)) {
				// Its pre-trade checks are stale, the broker is not reconciled or a switch is on: never sent late (ADR-0064 §7).
				if (
					now - order.createdAt > this._d.limits.maxIntentAgeMs ||
					!this._ready ||
					ks.global ||
					ks.symbols[order.symbol]
				) {
					this._move(order, "expired");
				} else {
					await this._submit(order);
				}
			}
			await this._save();
		});
	}

	/** Ready once the first reconciliation passed (ADR-0064 §4). */
	isReady(): boolean {
		return this._ready && !this._broken;
	}

	status(): StatusReport {
		const state = this._state;
		return {
			mode: this._d.mode,
			ready: this.isReady(),
			mismatch: this._mismatch,
			killSwitch: state.killSwitch,
			equity: equity(state),
			drawdownRatio:
				Math.max(0, state.hwm - equity(state)) /
				(this._d.limits.drawdownPct * this._d.limits.allocatedCapital),
			exposureRatio: exposure(state) / this._d.limits.allocatedCapital,
			dailyLoss: dailyLoss(state),
			openOrders: Object.values(state.orders).filter(isOpen).length,
			positions: state.positions,
			oldestPriceAgeSeconds: Math.max(
				0,
				...this._pricedSymbols().map(
					(sym) => (this._now() - state.marks[sym].at) / 1000
				)
			),
		};
	}

	async submitIntent(intent: Intent): Promise<IntentResult> {
		// Network call outside the queue: a slow trainer never delays an engage, a cancel or a tick.
		const { admissible, barMs } = await this._bounded(
			this._d.admission.admission(intent.model.symbol, intent.model.version),
			"admission"
		).catch((error) => {
			this._emit("admission.error", { error: String(error) });
			return { admissible: false, barMs: undefined }; // fail closed
		});
		return this._run(async () => {
			const now = this._now();
			const clientOrderId = `rx-${intent.decisionId}`;
			// First: an existing idempotency key is never rewritten (ADR-0064 §3).
			if (
				this._state.orders[clientOrderId] ||
				this._state.seen?.[clientOrderId] !== undefined
			) {
				return {
					status: "rejected",
					reason: "duplicate_client_order_id",
					clientOrderId,
				};
			}
			const [halted, read] = await Promise.all([
				this._bounded(this._d.broker.haltedSymbols(), "broker").catch(
					(error) => {
						this._emit("broker.error", { error: String(error) });
						return [intent.symbol]; // status unknown: fail closed
					}
				),
				this._readPrices([intent.symbol], barMs),
			]);
			rollDay(this._state, now, this._d.limits.haltAgeMs);
			const price = read[intent.symbol];
			const reason = preTradeReject({
				intent,
				limits: this._d.limits,
				state: this._state,
				now,
				admissible,
				barMs,
				reconciled: this._ready,
				halted,
				price,
			});
			const order: Order = {
				clientOrderId,
				decisionId: intent.decisionId,
				symbol: intent.symbol,
				side: intent.side,
				quantity: intent.quantity,
				limitPrice:
					intent.limitPrice ??
					(price && marketableLimit(intent.side, price.price, this._d.limits)),
				// The price read by the service: the paper broker fills at it, never at the intent's.
				referencePrice: price?.price ?? 0,
				status: "received",
				filledQty: 0,
				quoteQty: 0,
				fee: 0,
				createdAt: now,
				mode: this._d.mode,
			};
			this._state.orders[clientOrderId] = order;
			if (reason) {
				order.reason = reason;
				this._move(order, "rejected");
				await this._save();
				return { status: "rejected", reason, clientOrderId };
			}
			this._move(order, "accepted");
			await this._save(); // the idempotency key is durable before the broker sees it
			await this._submit(order);
			return { status: order.status, clientOrderId };
		});
	}

	/** Prices, expiry, unknown orders, stale data, loss limits, reconciliation: called on a timer. */
	tick(): Promise<void> {
		// One tick at a time: the timer never stacks entries behind a slow one.
		this._ticking ??= this._run(() => this._tick()).finally(() => {
			this._ticking = undefined;
		});
		return this._ticking;
	}

	private async _tick(): Promise<void> {
		const now = this._now();
		await this._readPrices(Object.keys(this._d.limits.instruments));
		rollDay(this._state, now, this._d.limits.haltAgeMs);
		for (const order of Object.values(this._state.orders).filter(isOpen)) {
			if (order.status !== "accepted") {
				await this._resolve(order);
			}
			if (isOpen(order) && now - order.createdAt > this._d.limits.orderTtlMs) {
				await this._expire(order);
			}
		}
		await this._checkStale(now);
		await this._checkLimits();
		if (now - this._lastReconcile >= RECONCILE_EVERY_MS) {
			await this._reconcile();
		}
		await this._save();
	}

	engage(scope: KillTarget, reason: string, actor: string): Promise<void> {
		const target = scope.scope === "global" ? null : scope.symbol;
		// The flag is set now, whatever the queue holds; cancels and persistence follow in it.
		const flagged =
			this._state !== undefined && this._flag(target, reason, actor);
		return this._run(async () => {
			// A rearm queued before this engage may have cleared the flag set above.
			if (this._flag(target, reason, actor) || flagged) {
				await this._cancelOpen(target);
			}
			await this._save();
		});
	}

	rearm(target: KillTarget, reason: string, actor: string): Promise<void> {
		const symbol = target.scope === "symbol" ? target.symbol : undefined;
		return this._run(async () => {
			if (this._broken) {
				throw new RearmRefusedError(
					"Kill switch state is unreadable: restore the state file, then restart"
				);
			}
			const ks = this._state.killSwitch;
			const current = symbol === undefined ? ks.global : ks.symbols[symbol];
			if (current === "drawdown" && actor !== this._d.ownerActor) {
				throw new RearmRefusedError(
					"Only the owner re-arms after the drawdown stop"
				);
			}
			// Without this the drawdown (hwm - equity) is still over the limit and the switch re-engages at the next tick.
			const previousHwm = this._state.hwm;
			if (current === "drawdown") {
				this._state.hwm = equity(this._state);
			}
			if (symbol === undefined) {
				ks.global = null;
			} else {
				delete ks.symbols[symbol];
			}
			try {
				await this._save();
			} catch (error) {
				// Not durable: stay engaged in memory, as after a restart, and emit nothing.
				this._state.hwm = previousHwm;
				if (symbol === undefined) {
					ks.global = current ?? null;
				} else if (current) {
					ks.symbols[symbol] = current;
				}
				throw error;
			}
			this._emit("kill_switch.rearmed", {
				scope: target.scope,
				symbol,
				reason,
				actor,
				...(current === "drawdown" && {
					previousHwm,
					hwm: this._state.hwm,
				}),
			});
		});
	}

	/** Always allowed, kill switch included. */
	cancel(clientOrderId: string): Promise<Order["status"] | "not_found"> {
		return this._run(async () => {
			const order = this._state.orders[clientOrderId];
			if (!order) {
				return "not_found";
			}
			if (isOpen(order)) {
				await this._cancelAtBroker(order);
			}
			await this._save();
			return order.status;
		});
	}

	// ── internals: run inside `_run` ───────────────────────────────────────

	private _move(order: Order, to: Order["status"]): void {
		transition(order, to);
		this._emit("order.transition", {
			clientOrderId: order.clientOrderId,
			symbol: order.symbol,
			status: to,
			reason: order.reason,
		});
	}

	private _emit(event: string, fields: Record<string, unknown>): void {
		this._d.emit?.(event, { ...fields, mode: this._d.mode });
	}

	private _emitBrokerError(order: Order, error: unknown): void {
		this._emit("broker.error", {
			clientOrderId: order.clientOrderId,
			error: String(error),
		});
	}

	private async _save(): Promise<void> {
		if (!this._broken) {
			// Final orders older than the longest window read by the pre-trade checks (rate: 60 s, duplicates).
			const keepMs = Math.max(60_000, this._d.limits.duplicateWindowMs);
			const cutoff = this._now() - keepMs;
			const seen = this._state.seen ?? {};
			this._state.seen = seen;
			for (const [id, order] of Object.entries(this._state.orders)) {
				if (FINAL.has(order.status) && order.createdAt < cutoff) {
					seen[id] = order.createdAt;
					delete this._state.orders[id];
				}
			}
			for (const [id, at] of Object.entries(seen)) {
				if (at < this._now() - SEEN_HORIZON_MS) {
					delete seen[id];
				}
			}
			await this._d.store.save(this._state);
		}
	}

	private async _submit(order: Order): Promise<void> {
		this._move(order, "submitted");
		await this._save();
		try {
			const view = await this._bounded(
				this._d.broker.submit({
					clientOrderId: order.clientOrderId,
					symbol: order.symbol,
					side: order.side,
					quantity: order.quantity,
					limitPrice: order.limitPrice,
					referencePrice: order.referencePrice,
				}),
				"broker"
			);
			await this._apply(order, view);
		} catch (error) {
			// Never resent: the broker is asked by client order id (ADR-0064 §3).
			this._emitBrokerError(order, error);
			this._move(order, "unknown");
			await this._failure(order.symbol);
			await this._resolve(order);
			await this._reconcile();
		}
		await this._save();
	}

	private async _resolve(order: Order): Promise<void> {
		try {
			const view = await this._bounded(
				this._d.broker.query(order.clientOrderId),
				"broker"
			);
			if (view) {
				await this._apply(order, view);
			} else if (order.status === "submitted") {
				this._move(order, "unknown");
			}
		} catch (error) {
			this._emitBrokerError(order, error);
			if (order.status === "submitted") {
				this._move(order, "unknown");
			}
		}
	}

	/** Applies the delta of the broker's cumulative fills: the position follows the fills, not the request. */
	private async _apply(order: Order, view: BrokerOrderView): Promise<void> {
		const dQty = applyFill(this._state, order, view);
		const target = targetStatus(order, view);
		if (
			order.status !== target ||
			(target === "partially_filled" && dQty > 0)
		) {
			if (target === "cancelled" && order.status !== "cancel_requested") {
				this._move(order, "cancel_requested");
			}
			this._move(order, target);
		}
		if (target === "broker_rejected") {
			await this._failure(order.symbol);
		}
		if (dQty > 0) {
			await this._checkLimits();
		}
	}

	private async _cancelAtBroker(order: Order): Promise<void> {
		if (order.status === "accepted") {
			return this._move(order, "expired");
		}
		if (order.status !== "cancel_requested") {
			this._move(order, "cancel_requested");
		}
		try {
			const view = await this._bounded(
				this._d.broker.cancel(order.clientOrderId),
				"broker"
			);
			if (view) {
				await this._apply(order, view);
			}
		} catch (error) {
			this._emitBrokerError(order, error);
		}
	}

	private async _expire(order: Order): Promise<void> {
		if (order.status === "accepted") {
			return this._move(order, "expired");
		}
		try {
			const view = await this._bounded(
				this._d.broker.cancel(order.clientOrderId),
				"broker"
			);
			if (view && view.filledQty > order.filledQty) {
				await this._apply(order, view);
			}
		} catch (error) {
			this._emitBrokerError(order, error);
		}
		if (!FINAL.has(order.status)) {
			this._move(order, "expired");
		}
	}

	private async _engage(
		symbol: string | null,
		reason: string,
		actor = "system"
	): Promise<void> {
		if (this._flag(symbol, reason, actor)) {
			await this._cancelOpen(symbol);
		}
	}

	/** Sets the switch in memory; false when it was already on. */
	private _flag(symbol: string | null, reason: string, actor: string): boolean {
		const ks = this._state.killSwitch;
		const current = symbol === null ? ks.global : ks.symbols[symbol];
		// drawdown overrides any other reason: it keeps re-arm owner-only (policy §4.4)
		if (
			current &&
			(reason !== "drawdown" ||
				current === "drawdown" ||
				current === "state_unreadable")
		) {
			return false;
		}
		if (symbol === null) {
			ks.global = reason;
		} else {
			ks.symbols[symbol] = reason;
		}
		this._emit("kill_switch.engaged", {
			scope: symbol === null ? "global" : "symbol",
			symbol,
			reason,
			actor,
		});
		return true;
	}

	private async _cancelOpen(symbol: string | null): Promise<void> {
		for (const order of Object.values(this._state.orders).filter(
			(candidate) =>
				isOpen(candidate) && (symbol === null || candidate.symbol === symbol)
		)) {
			await this._cancelAtBroker(order);
		}
	}

	private async _checkLimits(): Promise<void> {
		for (const { symbol, reason } of limitBreaches(
			this._state,
			this._d.limits
		)) {
			await this._engage(symbol, reason);
		}
	}

	/** Allowed instruments that ever had a price: a symbol never read is not stale data. */
	private _pricedSymbols(): string[] {
		return Object.keys(this._d.limits.instruments).filter(
			(sym) => this._state.marks[sym]
		);
	}

	private async _checkStale(now: number): Promise<void> {
		const priced = this._pricedSymbols();
		const stale = priced.filter(
			(sym) =>
				now - this._state.marks[sym].at >
				(this._state.marks[sym].maxAgeMs ?? this._d.limits.haltAgeMs)
		);
		for (const sym of stale) {
			await this._engage(sym, "stale_data");
		}
		if (stale.length && stale.length === priced.length) {
			await this._engage(null, "stale_data");
		}
	}

	/** Marks the symbols at the prices read (never older than the mark; aged by `barMs` when given); none when the read failed. */
	private async _readPrices(
		symbols: string[],
		barMs?: number
	): Promise<Record<string, MarketPrice>> {
		try {
			const read = await this._bounded(
				this._d.prices.latest(symbols, barMs),
				"price read"
			);
			for (const [symbol, mark] of Object.entries(read)) {
				if (mark.at >= (this._state.marks[symbol]?.at ?? 0)) {
					this._state.marks[symbol] = barMs
						? { ...mark, maxAgeMs: 2 * barMs }
						: mark;
				}
			}
			return read;
		} catch (error) {
			this._emit("prices.error", { error: String(error) });
			return {};
		}
	}

	private async _failure(symbol: string): Promise<void> {
		const { limits } = this._d;
		const now = this._now();
		const failures = (this._state.failures ?? [])
			.filter((failure) => now - failure.at < limits.rejectWindowMs)
			.concat({ at: now, symbol });
		this._state.failures = failures;
		if (
			failures.filter((failure) => failure.symbol === symbol).length >=
			limits.rejectsPerSymbol
		) {
			await this._engage(symbol, "rejects");
		}
		if (failures.length >= limits.rejectsGlobal) {
			await this._engage(null, "rejects");
		}
	}

	private async _reconcile(): Promise<void> {
		const state = this._state;
		let acct: BrokerAccount;
		try {
			acct = await this._bounded(this._d.broker.account(), "broker");
		} catch (error) {
			// Not ready, no new intent, retried at the next tick (ADR-0064 §7, broker unreachable).
			this._ready = false;
			this._lastReconcile = 0;
			this._emit("reconciliation.error", { error: String(error) });
			return;
		}
		this._lastReconcile = this._now();
		const diffs = reconciliationDiffs(state, acct, this._d.limits);
		this._mismatch = diffs.length > 0;
		this._ready = !this._mismatch;
		if (diffs.length) {
			// The store is never "fixed" to match the broker: the operator decides.
			this._emit("reconciliation.mismatch", { diffs });
			await this._engage(null, "reconciliation");
		}
	}
}
