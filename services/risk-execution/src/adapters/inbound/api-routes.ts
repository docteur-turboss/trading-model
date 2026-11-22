import {
	defineRoute,
	ErrorResponse,
} from "@trading-model/http/api-route/api-route";
import { z } from "zod";

const Result = z.object({
	status: z.string(),
	clientOrderId: z.string(),
	reason: z.string().optional(),
});
const Scope = z.object({
	scope: z.enum(["global", "symbol"]),
	symbol: z.string().min(1).optional(),
	reason: z.string().min(1),
	/** Who acts: recorded with the engagement or the re-arming (audit trail). */
	actor: z.string().min(1),
});

/**
 * Service-to-service API of risk-execution, never in PUBLIC_ROUTES (ADR-0064 §1).
 * `intents` and `cancel`: the decision consumer only; `admin*`: the operator, from the pod.
 */
export const RISK_API = {
	intent: defineRoute({
		method: "POST",
		path: "/intents",
		summary: "Submit an order intent: pre-trade checks, then the broker",
		body: z.object({
			decisionId: z.string().min(1),
			symbol: z.string().min(1),
			side: z.enum(["buy", "sell"]),
			quantity: z.number().positive(),
			limitPrice: z.number().positive().optional(),
			referencePrice: z.number().positive(),
			referenceAt: z.number().int().positive(),
			model: z.object({
				symbol: z.string().min(1),
				version: z.string().min(1),
			}),
			allowRepeat: z.boolean().optional(),
		}),
		responses: { 200: Result, 400: ErrorResponse, 403: ErrorResponse },
	}),
	cancel: defineRoute({
		method: "POST",
		path: "/orders/:clientOrderId/cancel",
		summary: "Cancel an open order (allowed while the kill switch is on)",
		params: z.object({ clientOrderId: z.string().min(1) }),
		responses: {
			200: z.object({ status: z.string() }),
			403: ErrorResponse,
			404: ErrorResponse,
		},
	}),
	adminStatus: defineRoute({
		method: "GET",
		path: "/admin/status",
		summary: "Mode, kill switch, equity and open orders",
		responses: {
			200: z.looseObject({
				mode: z.enum(["paper", "live"]),
				ready: z.boolean(),
			}),
			403: ErrorResponse,
		},
	}),
	adminEngage: defineRoute({
		method: "POST",
		path: "/admin/kill-switch",
		summary: "Engage the global or a per-symbol kill switch",
		body: Scope,
		responses: {
			200: z.object({ status: z.literal("engaged") }),
			400: ErrorResponse,
			403: ErrorResponse,
		},
	}),
	adminRearm: defineRoute({
		method: "POST",
		path: "/admin/kill-switch/rearm",
		summary: "Re-arm by hand: the only way to switch it off",
		body: Scope,
		responses: {
			200: z.object({ status: z.literal("rearmed") }),
			400: ErrorResponse,
			403: ErrorResponse,
		},
	}),
} as const;
