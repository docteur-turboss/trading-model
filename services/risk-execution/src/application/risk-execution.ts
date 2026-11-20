import type { RiskLimits } from "../domain/limits";
import { FINAL, type Order, transition } from "../domain/order";
import type {
	AdmissionPort,
	BrokerAccount,
	BrokerOrderView,
	BrokerPort,
	StatePort,
} from "../domain/ports";
import {
	dailyLoss,
	type Intent,
	preTradeReject,
	symbolLoss,
} from "../domain/pre-trade";
import {
	equity,
	isOpen,
	newState,
	type RiskState,
	utcDate,
} from "../domain/state";

export interface RiskExecutionDeps {
	limits: RiskLimits;
	broker: BrokerPort;
	store: StatePort<RiskState>;
	admission: AdmissionPort;
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
const WIRED_STATES: Order["status"][] = [
	"submitted",
	"acknowledged",
	"partially_filled",
	"unknown",
	"cancel_requested",
];

/** The Risk/Execution context of ADR-0064: the only owner of the order flow. */
export class RiskExecution {
	private _state!: RiskState;
	private _ready = false;
	private _broken = false;
	private _lastReconcile = 0;
	private _tail: Promise<unknown> = Promise.resolve();
	private _failures: { at: number; symbol: string }[] = [];
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

	/** Loads the state (unreadable: global switch on, fail closed), finishes interrupted orders, then reconciles. */
	start(): Promise<void> {
		return this._run(async () => {
			const now = this._now();
			try {
				this._state =
					(await this._d.store.load()) ??
					newState(this._d.limits.allocatedCapital, now);
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
			const ks = this._state.killSwitch;
			for (const order of Object.values(this._state.orders)) {
				if (order.status === "accepted") {
					// Its pre-trade checks are stale or a switch is on: never sent late (ADR-0064 §7).
					if (
						now - order.createdAt > this._d.limits.maxIntentAgeMs ||
						ks.global ||
						ks.symbols[order.symbol]
					) {
						this._move(order, "expired");
					} else {
						await this._submit(order);
					}
				} else if (order.status === "submitted" || order.status === "unknown") {
					await this._resolve(order);
				}
			}
			await this._reconcile();
			await this._save();
		});
	}

	/** Ready once the first reconciliation passed (ADR-0064 §4). */
	isReady(): boolean {
		return this._ready && !this._broken;
	}

	status() {
		const state = this._state;
		return {
			mode: this._d.mode,
			ready: this.isReady(),
			killSwitch: state.killSwitch,
			equity: equity(state),
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

	submitIntent(intent: Intent): Promise<IntentResult> {
		return this._run(async () => {
			const now = this._now();
			this._rollDay(now);
			const clientOrderId = `rx-${intent.decisionId}`;
			// First: an existing idempotency key is never rewritten (ADR-0064 §3).
			if (this._state.orders[clientOrderId]) {
				return {
					status: "rejected",
					reason: "duplicate_client_order_id",
					clientOrderId,
				};
			}
			const [admissible, halted] = await Promise.all([
				this._d.admission
					.isAdmissible(intent.model.symbol, intent.model.version)
					.catch((error) => {
						this._emit("admission.error", { error: String(error) });
						return false;
					}),
				this._d.broker.haltedSymbols().catch((error) => {
					this._emit("broker.error", { error: String(error) });
					return [intent.symbol]; // status unknown: fail closed
				}),
			]);
			const reason = preTradeReject({
				intent,
				limits: this._d.limits,
				state: this._state,
				now,
				admissible,
				reconciled: this._ready,
				halted,
			});
			const order: Order = {
				clientOrderId,
				decisionId: intent.decisionId,
				symbol: intent.symbol,
				side: intent.side,
				quantity: intent.quantity,
				limitPrice: intent.limitPrice,
				referencePrice: intent.referencePrice,
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
			this._state.marks[intent.symbol] = {
				price: intent.referencePrice,
				at: intent.referenceAt,
			};
			this._move(order, "accepted");
			await this._save(); // the idempotency key is durable before the broker sees it
			await this._submit(order);
			return { status: order.status, clientOrderId };
		});
	}

	/** shortcut: prices are pushed by the decision consumer, read the scraper when that consumer exists. */
	observePrice(symbol: string, price: number, at: number): Promise<void> {
		return this._run(async () => {
			this._state.marks[symbol] = { price, at };
			await this._checkLimits();
			await this._save();
		});
	}

	/** Expiry, unknown orders, stale data, loss limits, reconciliation: called on a timer. */
	tick(): Promise<void> {
		return this._run(async () => {
			const now = this._now();
			this._rollDay(now);
			for (const order of Object.values(this._state.orders).filter(isOpen)) {
				if (order.status !== "accepted") {
					await this._resolve(order);
				}
				if (
					isOpen(order) &&
					now - order.createdAt > this._d.limits.orderTtlMs
				) {
					await this._expire(order);
				}
			}
			await this._checkStale(now);
			await this._checkLimits();
			if (now - this._lastReconcile >= RECONCILE_EVERY_MS) {
				await this._reconcile();
			}
			await this._save();
		});
	}

	engage(
		scope: "global" | "symbol",
		reason: string,
		actor: string,
		symbol?: string
	): Promise<void> {
		return this._run(async () => {
			await this._engage(
				scope === "global" ? null : (symbol ?? ""),
				reason,
				actor
			);
			await this._save();
		});
	}

	rearm(
		scope: "global" | "symbol",
		reason: string,
		actor: string,
		symbol?: string
	): Promise<void> {
		return this._run(async () => {
			if (this._broken) {
				throw new Error(
					"Kill switch state is unreadable: restore the state file, then restart"
				);
			}
			const ks = this._state.killSwitch;
			const current = scope === "global" ? ks.global : ks.symbols[symbol ?? ""];
			if (current === "drawdown" && actor !== this._d.ownerActor) {
				throw new Error("Only the owner re-arms after the drawdown stop");
			}
			if (scope === "global") {
				ks.global = null;
			} else {
				delete ks.symbols[symbol ?? ""];
			}
			this._emit("kill_switch.rearmed", { scope, symbol, reason, actor });
			await this._save();
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

	private async _save(): Promise<void> {
		if (!this._broken) {
			await this._d.store.save(this._state);
		}
	}

	private async _submit(order: Order): Promise<void> {
		this._move(order, "submitted");
		await this._save();
		try {
			const view = await withTimeout(
				this._d.broker.submit({
					clientOrderId: order.clientOrderId,
					symbol: order.symbol,
					side: order.side,
					quantity: order.quantity,
					limitPrice: order.limitPrice,
					referencePrice: order.referencePrice,
				}),
				this._d.limits.submitTimeoutMs
			);
			await this._apply(order, view);
		} catch (error) {
			// Never resent: the broker is asked by client order id (ADR-0064 §3).
			this._emit("broker.error", {
				clientOrderId: order.clientOrderId,
				error: String(error),
			});
			this._move(order, "unknown");
			await this._failure(order.symbol);
			await this._resolve(order);
			await this._reconcile();
		}
		await this._save();
	}

	private async _resolve(order: Order): Promise<void> {
		try {
			const view = await this._d.broker.query(order.clientOrderId);
			if (view) {
				await this._apply(order, view);
			} else if (order.status === "submitted") {
				this._move(order, "unknown");
			}
		} catch (error) {
			this._emit("broker.error", {
				clientOrderId: order.clientOrderId,
				error: String(error),
			});
			if (order.status === "submitted") {
				this._move(order, "unknown");
			}
		}
	}

	/** Applies the delta of the broker's cumulative fills: the position follows the fills, not the request. */
	private async _apply(order: Order, view: BrokerOrderView): Promise<void> {
		const state = this._state;
		const dQty = view.filledQty - order.filledQty;
		if (dQty > 0) {
			const dQuote = view.quoteQty - order.quoteQty;
			const dFee = view.fee - order.fee;
			const sign = order.side === "buy" ? 1 : -1;
			state.day.symbols[order.symbol] ??= {
				startValue:
					(state.positions[order.symbol] ?? 0) *
					(state.marks[order.symbol]?.price ?? 0),
				flow: 0,
			};
			const entry = state.day.symbols[order.symbol];
			entry.flow += -sign * dQuote - dFee;
			state.cash += -sign * dQuote - dFee;
			state.positions[order.symbol] =
				(state.positions[order.symbol] ?? 0) + sign * dQty;
			state.marks[order.symbol] = { price: dQuote / dQty, at: this._now() };
			Object.assign(order, {
				filledQty: view.filledQty,
				quoteQty: view.quoteQty,
				fee: view.fee,
			});
		}
		const target: Order["status"] =
			view.status === "filled"
				? "filled"
				: view.status === "rejected"
					? "broker_rejected"
					: view.status === "cancelled"
						? "cancelled"
						: view.filledQty > 0
							? "partially_filled"
							: "acknowledged";
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
			const view = await this._d.broker.cancel(order.clientOrderId);
			if (view) {
				await this._apply(order, view);
			}
		} catch (error) {
			this._emit("broker.error", {
				clientOrderId: order.clientOrderId,
				error: String(error),
			});
		}
	}

	private async _expire(order: Order): Promise<void> {
		if (order.status === "accepted") {
			return this._move(order, "expired");
		}
		try {
			const view = await this._d.broker.cancel(order.clientOrderId);
			if (view && view.filledQty > order.filledQty) {
				await this._apply(order, view);
			}
		} catch (error) {
			this._emit("broker.error", {
				clientOrderId: order.clientOrderId,
				error: String(error),
			});
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
		const ks = this._state.killSwitch;
		if (symbol === null ? ks.global : ks.symbols[symbol]) {
			return;
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
		for (const order of Object.values(this._state.orders).filter(
			(candidate) =>
				isOpen(candidate) && (symbol === null || candidate.symbol === symbol)
		)) {
			await this._cancelAtBroker(order);
		}
	}

	private async _checkLimits(): Promise<void> {
		const { limits } = this._d;
		const state = this._state;
		const eq = equity(state);
		state.hwm = Math.max(state.hwm, eq);
		if (dailyLoss(state) >= limits.dailyLossPct * limits.allocatedCapital) {
			await this._engage(null, "daily_loss");
		}
		if (state.hwm - eq >= limits.drawdownPct * limits.allocatedCapital) {
			await this._engage(null, "drawdown");
		}
		for (const symbol of Object.keys(state.day.symbols)) {
			if (
				symbolLoss(state, symbol) >=
				limits.symbolDailyLossPct * limits.allocatedCapital
			) {
				await this._engage(symbol, "daily_loss_symbol");
			}
		}
	}

	/** Allowed instruments that ever had a price: no feed yet (no decision consumer) is not stale data. */
	private _pricedSymbols(): string[] {
		return Object.keys(this._d.limits.instruments).filter(
			(sym) => this._state.marks[sym]
		);
	}

	private async _checkStale(now: number): Promise<void> {
		const priced = this._pricedSymbols();
		const stale = priced.filter(
			(sym) => now - this._state.marks[sym].at > this._d.limits.haltAgeMs
		);
		for (const sym of stale) {
			await this._engage(sym, "stale_data");
		}
		if (stale.length && stale.length === priced.length) {
			await this._engage(null, "stale_data");
		}
	}

	private async _failure(symbol: string): Promise<void> {
		const { limits } = this._d;
		const now = this._now();
		this._failures = this._failures
			.filter((failure) => now - failure.at < limits.rejectWindowMs)
			.concat({ at: now, symbol });
		if (
			this._failures.filter((failure) => failure.symbol === symbol).length >=
			limits.rejectsPerSymbol
		) {
			await this._engage(symbol, "rejects");
		}
		if (this._failures.length >= limits.rejectsGlobal) {
			await this._engage(null, "rejects");
		}
	}

	private async _reconcile(): Promise<void> {
		const state = this._state;
		let acct: BrokerAccount;
		try {
			acct = await this._d.broker.account();
		} catch (error) {
			// Not ready, no new intent, retried at the next tick (ADR-0064 §7, broker unreachable).
			this._ready = false;
			this._lastReconcile = 0;
			this._emit("reconciliation.error", { error: String(error) });
			return;
		}
		this._lastReconcile = this._now();
		const diffs: string[] = [];
		for (const sym of new Set([
			...Object.keys(state.positions),
			...Object.keys(acct.positions),
		])) {
			if (
				Math.abs((state.positions[sym] ?? 0) - (acct.positions[sym] ?? 0)) >
				1e-9
			) {
				diffs.push(`position:${sym}`);
			}
		}
		const ours = Object.values(state.orders).filter((order) =>
			WIRED_STATES.includes(order.status)
		);
		const brokerOpen = new Set(acct.openOrders);
		if (
			ours.length !== brokerOpen.size ||
			ours.some((order) => !brokerOpen.has(order.clientOrderId))
		) {
			diffs.push("open_orders");
		}
		if (
			Math.abs(state.cash - acct.cash) >
			this._d.limits.balanceTolerancePct * this._d.limits.allocatedCapital
		) {
			diffs.push("balance");
		}
		this._ready = diffs.length === 0;
		if (diffs.length) {
			// The store is never "fixed" to match the broker: the operator decides.
			this._emit("reconciliation.mismatch", { diffs });
			await this._engage(null, "reconciliation");
		}
	}

	private _rollDay(now: number): void {
		const state = this._state;
		const date = utcDate(now);
		if (state.day.date === date) {
			return;
		}
		state.day = {
			date,
			startEquity: equity(state),
			symbols: Object.fromEntries(
				Object.entries(state.positions).map(([sym, qty]) => [
					sym,
					{ startValue: qty * (state.marks[sym]?.price ?? 0), flow: 0 },
				])
			),
		};
	}
}

function withTimeout<Result>(
	promise: Promise<Result>,
	ms: number
): Promise<Result> {
	let timer: NodeJS.Timeout;
	return Promise.race([
		promise,
		new Promise<never>((_, reject) => {
			timer = setTimeout(
				() => reject(new Error(`broker timeout after ${ms} ms`)),
				ms
			);
		}),
	]).finally(() => clearTimeout(timer));
}
