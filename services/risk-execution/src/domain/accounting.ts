import type { Order } from "@trading-model/contracts/order-intent";
import type { RiskLimits } from "./limits";
import type { BrokerAccount, BrokerOrderView } from "./ports";
import { dailyLoss, symbolLoss } from "./pre-trade";
import { equity, type RiskState, utcDate } from "./state";

/** Kill switch target: the whole book, or one symbol (never a symbol scope without a symbol). */
export type KillTarget =
	| { scope: "global" }
	| { scope: "symbol"; symbol: string };

const WIRED_STATES: Order["status"][] = [
	"submitted",
	"acknowledged",
	"partially_filled",
	"unknown",
	"cancel_requested",
];

/** Books the delta of the broker's cumulative fills (cash, position, day flow, order totals). Returns the filled delta. */
export function applyFill(
	state: RiskState,
	order: Order,
	view: BrokerOrderView
): number {
	const dQty = view.filledQty - order.filledQty;
	if (dQty <= 0) {
		return dQty;
	}
	const dQuote = view.quoteQty - order.quoteQty;
	const dFee = view.fee - order.fee;
	const sign = order.side === "buy" ? 1 : -1;
	state.day.symbols[order.symbol] ??= {
		startValue:
			(state.positions[order.symbol] ?? 0) *
			(state.marks[order.symbol]?.price ?? 0),
		flow: 0,
	};
	state.day.symbols[order.symbol].flow += -sign * dQuote - dFee;
	state.cash += -sign * dQuote - dFee;
	state.positions[order.symbol] =
		(state.positions[order.symbol] ?? 0) + sign * dQty;
	Object.assign(order, {
		filledQty: view.filledQty,
		quoteQty: view.quoteQty,
		fee: view.fee,
	});
	return dQty;
}

/** Raises the high-water mark, then lists the limits broken, in engagement order: daily loss, drawdown, symbols. */
export function limitBreaches(
	state: RiskState,
	limits: RiskLimits
): { symbol: string | null; reason: string }[] {
	const eq = equity(state);
	state.hwm = Math.max(state.hwm, eq);
	const cap = limits.allocatedCapital;
	const out: { symbol: string | null; reason: string }[] = [];
	if (dailyLoss(state) >= limits.dailyLossPct * cap) {
		out.push({ symbol: null, reason: "daily_loss" });
	}
	if (state.hwm - eq >= limits.drawdownPct * cap) {
		out.push({ symbol: null, reason: "drawdown" });
	}
	for (const symbol of Object.keys(state.day.symbols)) {
		if (symbolLoss(state, symbol) >= limits.symbolDailyLossPct * cap) {
			out.push({ symbol, reason: "daily_loss_symbol" });
		}
	}
	return out;
}

/** Starts a new UTC day when the date changed: day start equity and per-symbol start values. */
export function rollDay(state: RiskState, now: number): void {
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

/** Differences between our state and the broker account; the store is never fixed to match. */
export function reconciliationDiffs(
	state: RiskState,
	account: BrokerAccount,
	limits: RiskLimits
): string[] {
	const diffs: string[] = [];
	for (const sym of new Set([
		...Object.keys(state.positions),
		...Object.keys(account.positions),
	])) {
		if (
			Math.abs((state.positions[sym] ?? 0) - (account.positions[sym] ?? 0)) >
			1e-9
		) {
			diffs.push(`position:${sym}`);
		}
	}
	const ours = Object.values(state.orders).filter((order) =>
		WIRED_STATES.includes(order.status)
	);
	const brokerOpen = new Set(account.openOrders);
	if (
		ours.length !== brokerOpen.size ||
		ours.some((order) => !brokerOpen.has(order.clientOrderId))
	) {
		diffs.push("open_orders");
	}
	if (
		Math.abs(state.cash - account.cash) >
		limits.balanceTolerancePct * limits.allocatedCapital
	) {
		diffs.push("balance");
	}
	return diffs;
}
