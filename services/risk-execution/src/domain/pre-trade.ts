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
	return (
		gateReject(ctx) ??
		priceReject(ctx) ??
		exposureReject(ctx) ??
		balanceReject(ctx) ??
		rateReject(ctx) ??
		lossReject(ctx)
	);
}

const orderPrice = (intent: Intent): number =>
	intent.limitPrice ?? intent.referencePrice;

/** Clock skew accepted on a timestamp pushed by a caller. */
export const CLOCK_SKEW_MS = 5000;

function gateReject(ctx: PreTradeContext): string | null {
	const { intent, limits, state, now } = ctx;
	const instrument = limits.instruments[intent.symbol];
	if (state.killSwitch.global || state.killSwitch.symbols[intent.symbol]) {
		return "kill_switch";
	}
	if (!ctx.reconciled) {
		return "not_reconciled";
	}
	if (intent.model.symbol !== intent.symbol) {
		return "model_symbol_mismatch";
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
	if (
		intent.referenceAt > now + CLOCK_SKEW_MS ||
		now - intent.referenceAt > limits.maxIntentAgeMs
	) {
		return "stale_intent";
	}
	if (intent.quantity > instrument.maxQuantity) {
		return "max_quantity";
	}
	return null;
}

function priceReject(ctx: PreTradeContext): string | null {
	const { intent, limits, state } = ctx;
	if (
		intent.quantity * orderPrice(intent) >
		limits.orderNotionalPct * limits.allocatedCapital
	) {
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
	return null;
}

function exposureReject(ctx: PreTradeContext): string | null {
	const { intent, limits, state } = ctx;
	const cap = limits.allocatedCapital;
	const signed = intent.side === "buy" ? intent.quantity : -intent.quantity;
	if (
		(projectedPositions(state, "sell")[intent.symbol] ?? 0) + signed <
		-1e-12
	) {
		return "short_selling";
	}
	const projected = projectedPositions(state, "buy");
	const after = (projected[intent.symbol] ?? 0) + signed;
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
	return global > equity(state) ? "leverage" : null;
}

function balanceReject(ctx: PreTradeContext): string | null {
	const { intent, limits, state } = ctx;
	if (intent.side !== "buy") {
		return null;
	}
	const reserved = Object.values(state.orders)
		.filter((order) => isOpen(order) && order.side === "buy")
		.reduce(
			(sum, order) =>
				sum +
				(order.quantity - order.filledQty) *
					(order.limitPrice ?? order.referencePrice),
			0
		);
	return state.cash - reserved <
		intent.quantity *
			orderPrice(intent) *
			(1 + (limits.feeBps + limits.slippageBps) / 10_000)
		? "insufficient_balance"
		: null;
}

function rateReject(ctx: PreTradeContext): string | null {
	const { intent, limits, state, now } = ctx;
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
	return dup && !intent.allowRepeat ? "duplicate_window" : null;
}

function lossReject(ctx: PreTradeContext): string | null {
	const { intent, limits, state } = ctx;
	if (intent.side !== "buy") {
		return null;
	}
	const cap = limits.allocatedCapital;
	// Worst case: filled at the far end of the band, marked back to the reference price (policy §3).
	const worst = intent.quantity * intent.referencePrice * limits.priceBandPct;
	if (dailyLoss(state) + worst >= limits.dailyLossPct * cap) {
		return "loss_limit_daily";
	}
	return symbolLoss(state, intent.symbol) + worst >=
		limits.symbolDailyLossPct * cap
		? "loss_limit_symbol"
		: null;
}

export const dailyLoss = (state: RiskState): number =>
	Math.max(0, state.day.startEquity - equity(state));
export const symbolLoss = (state: RiskState, symbol: string): number =>
	Math.max(0, -symbolPnl(state, symbol));
