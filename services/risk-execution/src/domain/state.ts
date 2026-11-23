import type { Order } from "./order";
import type { MarketPrice } from "./ports";

export interface RiskState {
	killSwitch: {
		global: string | null;
		/** Symbol -> reason. */
		symbols: Record<string, string>;
	};
	orders: Record<string, Order>;
	/** clientOrderId -> createdAt of purged final orders, kept SEEN_HORIZON_MS so a late replay stays a duplicate (ADR-0064 §3). */
	seen?: Record<string, number>;
	cash: number;
	positions: Record<string, number>;
	marks: Record<string, MarketPrice>;
	hwm: number;
	day: {
		date: string;
		startEquity: number;
		/** Per symbol since 00:00 UTC: position value at the start, net cash flow incl. fees. */
		symbols: Record<string, { startValue: number; flow: number }>;
	};
}

export const SEEN_HORIZON_MS = 7 * 86_400_000;

export function newState(capital: number, now: number): RiskState {
	return {
		killSwitch: { global: null, symbols: {} },
		orders: {},
		cash: capital,
		positions: {},
		marks: {},
		hwm: capital,
		day: { date: utcDate(now), startEquity: capital, symbols: {} },
	};
}

export const utcDate = (ms: number): string =>
	new Date(ms).toISOString().slice(0, 10);

const OPEN_STATUSES = new Set([
	"accepted",
	"submitted",
	"acknowledged",
	"unknown",
	"partially_filled",
	"cancel_requested",
]);
export const isOpen = (order: Order): boolean =>
	OPEN_STATUSES.has(order.status);

/** Market value of the positions at their last marks (the global exposure of ADR-0064). */
export function exposure(state: RiskState): number {
	let total = 0;
	for (const [symbol, qty] of Object.entries(state.positions)) {
		total += qty * (state.marks[symbol]?.price ?? 0);
	}
	return total;
}

export function equity(state: RiskState): number {
	return state.cash + exposure(state);
}

/**
 * Position per symbol with the open orders of one side counted as filled
 * (ADR-0064 §2, worst case): an open order of the other side never hedges.
 */
export function projectedPositions(
	state: RiskState,
	side: Order["side"]
): Record<string, number> {
	const out = { ...state.positions };
	for (const order of Object.values(state.orders)) {
		if (isOpen(order) && order.side === side) {
			out[order.symbol] =
				(out[order.symbol] ?? 0) +
				(order.side === "buy" ? 1 : -1) * (order.quantity - order.filledQty);
		}
	}
	return out;
}

export function symbolPnl(state: RiskState, symbol: string): number {
	const entry = state.day.symbols[symbol];
	const value =
		(state.positions[symbol] ?? 0) * (state.marks[symbol]?.price ?? 0);
	return entry ? value + entry.flow - entry.startValue : 0;
}
