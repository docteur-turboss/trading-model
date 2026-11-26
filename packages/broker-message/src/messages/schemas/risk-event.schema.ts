import { RiskEvent } from "@trading-model/contracts/risk-events";
import { z } from "zod";

const MODE = z.enum(["paper", "live"]);
/** Stable across replays of one event (risk-execution outbox). */
const EVENT_ID = z.string().min(1).optional();
const SCOPE = z.enum(["global", "symbol"]);

/** Validators of the risk-execution event payloads, by event type. */
export const RISK_EVENT_VALIDATORS = {
	[RiskEvent.OrderTransitioned]: z.object({
		eventId: EVENT_ID,
		mode: MODE,
		clientOrderId: z.string().min(1),
		symbol: z.string().min(1),
		status: z.string().min(1),
		reason: z.string().nullish(),
		actor: z.string().min(1).optional(),
	}),
	[RiskEvent.KillSwitchEngaged]: z.object({
		eventId: EVENT_ID,
		mode: MODE,
		scope: SCOPE,
		symbol: z.string().nullish(),
		reason: z.string().min(1),
		actor: z.string().optional(),
		error: z.string().optional(),
	}),
	[RiskEvent.KillSwitchRearmed]: z.object({
		eventId: EVENT_ID,
		mode: MODE,
		scope: SCOPE,
		symbol: z.string().nullish(),
		reason: z.string().min(1),
		actor: z.string().min(1),
	}),
	[RiskEvent.PromotionLoaded]: z.object({
		eventId: EVENT_ID,
		symbol: z.string().min(1),
		version: z.string().min(1),
		sha256: z.string().regex(/^[0-9a-f]{64}$/),
	}),
};
