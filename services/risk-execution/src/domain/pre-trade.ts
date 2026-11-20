import type { RiskLimits } from "./limits";
import {
	equity,
	isOpen,
	projectedPositions,
	type RiskState,
	symbolPnl,
} from "./state";

export interface Intent {
	decisionId: string;
	symbol: string;
	side: "buy" | "sell";
	quantity: number;
	limitPrice?: number;
	referencePrice: number;
	referenceAt: number;
	model: { symbol: string; version: string };
	allowRepeat?: boolean;
}

export interface PreTradeContext {
	intent: Intent;
	limits: RiskLimits;
	state: RiskState;
	now: number;
	admissible: boolean;
	/** The last reconciliation passed: none after a broker error until one does (ADR-0064 §7). */
	reconciled: boolean;
	/** Instruments the exchange reports as not in trading status. */
	halted: readonly string[];
}

/** Reason codes: the first failing check rejects the intent (ADR-0064 §2). */
export function preTradeReject(ctx: PreTradeContext): string | null {
	const { intent, limits, state, now } = ctx;
	const cap = limits.allocatedCapital;
	const instrument = limits.instruments[intent.symbol];
	const open = Object.values(state.orders).filter(isOpen);

	if (state.killSwitch.global || state.killSwitch.symbols[intent.symbol]) {
		return "kill_switch";
	}
	if (!ctx.reconciled) {
		return "not_reconciled";
	}
	if (!ctx.admissible) {
		return "model_not_admitted";
	}
	if (!instrument) {
		return "instrument_not_allowed";
	}
	if (ctx.halted.includes(intent.symbol)) {
		return "instrument_halted";
	}
	if (now - intent.referenceAt > limits.maxIntentAgeMs) {
		return "stale_intent";
	}
	if (intent.quantity > instrument.maxQuantity) {
		return "max_quantity";
	}
	const price = intent.limitPrice ?? intent.referencePrice;
	if (intent.quantity * price > limits.orderNotionalPct * cap) {
		return "max_notional";
	}
	if (
		intent.limitPrice !== undefined &&
		Math.abs(intent.limitPrice / intent.referencePrice - 1) >
			limits.priceBandPct
	) {
		return "price_band";
	}
	const mark = state.marks[intent.symbol];
	if (
		mark &&
		Math.abs(intent.referencePrice / mark.price - 1) > limits.priceBandPct
	) {
		return "price_gap";
	}

	const projected = projectedPositions(state);
	const after =
		(projected[intent.symbol] ?? 0) +
		(intent.side === "buy" ? intent.quantity : -intent.quantity);
	if (after < -1e-12) {
		return "short_selling";
	}
	if (after * intent.referencePrice > limits.instrumentExposurePct * cap) {
		return "instrument_exposure";
	}
	projected[intent.symbol] = after;
	let global = 0;
	for (const [symbol, qty] of Object.entries(projected)) {
		global +=
			qty *
			(symbol === intent.symbol
				? intent.referencePrice
				: (state.marks[symbol]?.price ?? 0));
	}
	if (global > limits.globalExposurePct * cap) {
		return "global_exposure";
	}
	if (global > equity(state)) {
		return "leverage";
	}

	if (intent.side === "buy") {
		const reserved = open
			.filter((order) => order.side === "buy")
			.reduce(
				(sum, order) =>
					sum +
					(order.quantity - order.filledQty) *
						(order.limitPrice ?? order.referencePrice),
				0
			);
		if (
			state.cash - reserved <
			intent.quantity * price * (1 + limits.feeBps / 10_000)
		) {
			return "insufficient_balance";
		}
	}

	const recent = Object.values(state.orders).filter(
		(order) => now - order.createdAt < 60_000 && order.status !== "rejected"
	);
	if (
		recent.filter((order) => order.symbol === intent.symbol).length >=
		limits.ordersPerMinutePerSymbol
	) {
		return "rate_symbol";
	}
	if (recent.length >= limits.ordersPerMinuteGlobal) {
		return "rate_global";
	}
	const dup = Object.values(state.orders).some(
		(order) =>
			order.symbol === intent.symbol &&
			order.side === intent.side &&
			order.quantity === intent.quantity &&
			now - order.createdAt < limits.duplicateWindowMs &&
			order.status !== "rejected"
	);
	if (dup && !intent.allowRepeat) {
		return "duplicate_window";
	}

	// Worst case: filled at the far end of the band, marked back to the reference price (policy §3).
	if (intent.side === "buy") {
		const worst = intent.quantity * intent.referencePrice * limits.priceBandPct;
		if (dailyLoss(state) + worst >= limits.dailyLossPct * cap) {
			return "loss_limit_daily";
		}
		if (
			symbolLoss(state, intent.symbol) + worst >=
			limits.symbolDailyLossPct * cap
		) {
			return "loss_limit_symbol";
		}
	}
	return null;
}

export const dailyLoss = (state: RiskState): number =>
	Math.max(0, state.day.startEquity - equity(state));
export const symbolLoss = (state: RiskState, symbol: string): number =>
	Math.max(0, -symbolPnl(state, symbol));
