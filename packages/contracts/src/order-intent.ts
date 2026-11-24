import { z } from "zod";

/** Body of risk-execution `POST /intents`, sent by the decision consumer (ADR-0064 §1). */
export const Intent = z.object({
	decisionId: z.string().min(1),
	symbol: z.string().min(1),
	side: z.enum(["buy", "sell"]),
	quantity: z.number().positive(),
	limitPrice: z.number().positive().optional(),
	referencePrice: z.number().positive(),
	referenceAt: z.number().int().positive(),
	model: z.object({ symbol: z.string().min(1), version: z.string().min(1) }),
	allowRepeat: z.boolean().optional(),
});
export type Intent = z.infer<typeof Intent>;

/** Order life cycle of ADR-0064 §3. */
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
