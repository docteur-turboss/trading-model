export type OrderStatus =
	| "received"
	| "rejected"
	| "accepted"
	| "submitted"
	| "acknowledged"
	| "broker_rejected"
	| "unknown"
	| "partially_filled"
	| "filled"
	| "cancel_requested"
	| "cancelled"
	| "expired";

/** Closed table of ADR-0064 §3: any other transition is an error. */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
	received: ["rejected", "accepted"],
	accepted: ["submitted", "unknown", "cancel_requested", "expired"],
	submitted: [
		"acknowledged",
		"broker_rejected",
		"unknown",
		"partially_filled",
		"filled",
		"cancel_requested",
	],
	acknowledged: ["partially_filled", "filled", "cancel_requested", "expired"],
	unknown: [
		"acknowledged",
		"broker_rejected",
		"partially_filled",
		"filled",
		"cancel_requested",
		"expired",
	],
	partially_filled: [
		"partially_filled",
		"filled",
		"cancel_requested",
		"expired",
	],
	cancel_requested: ["cancelled", "partially_filled", "filled", "expired"],
	rejected: [],
	broker_rejected: [],
	filled: [],
	cancelled: [],
	expired: [],
};

export const FINAL: ReadonlySet<OrderStatus> = new Set([
	"rejected",
	"broker_rejected",
	"filled",
	"cancelled",
	"expired",
]);

export interface Order {
	clientOrderId: string;
	decisionId: string;
	symbol: string;
	side: "buy" | "sell";
	quantity: number;
	limitPrice?: number;
	referencePrice: number;
	status: OrderStatus;
	filledQty: number;
	/** Cumulative notional and fee of the broker fills, never derived from `quantity`. */
	quoteQty: number;
	fee: number;
	createdAt: number;
	reason?: string;
	mode: "paper" | "live";
}

export function transition(order: Order, to: OrderStatus): void {
	if (!TRANSITIONS[order.status].includes(to)) {
		throw new Error(
			`Illegal order transition ${order.status} -> ${to} (${order.clientOrderId})`
		);
	}
	order.status = to;
}
