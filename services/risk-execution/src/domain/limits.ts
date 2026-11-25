import { z } from "zod";

/**
 * Hard ceilings of ADR-0064 §2: code, not configuration. A configured value
 * above its ceiling refuses to start. Loss limits and the global exposure cap
 * are the values of docs/compliance/risk-limits-policy.md (§3, §3.1).
 */
export const HARD_CEILINGS = {
	dailyLossPct: 0.02,
	drawdownPct: 0.1,
	symbolDailyLossPct: 0.01,
	globalExposurePct: 0.1,
	instrumentExposurePct: 0.1,
	orderNotionalPct: 0.1,
	priceBandPct: 0.05,
	maxIntentAgeMs: 60_000,
	haltAgeMs: 900_000,
	ordersPerMinutePerSymbol: 10,
	ordersPerMinuteGlobal: 60,
} as const;

const upTo = (max: number) => z.number().positive().max(max);

/** Service limits, validated at startup (fail closed). Defaults: the policy values, other caps at or below their ceiling. */
export const RiskLimits = z.object({
	/** Allocated capital of the mode (policy §2): every percentage below is a share of it. */
	allocatedCapital: z.number().positive(),
	dailyLossPct: upTo(HARD_CEILINGS.dailyLossPct).default(0.02),
	drawdownPct: upTo(HARD_CEILINGS.drawdownPct).default(0.1),
	symbolDailyLossPct: upTo(HARD_CEILINGS.symbolDailyLossPct).default(0.01),
	globalExposurePct: upTo(HARD_CEILINGS.globalExposurePct).default(0.1),
	instrumentExposurePct: upTo(HARD_CEILINGS.instrumentExposurePct).default(0.1),
	orderNotionalPct: upTo(HARD_CEILINGS.orderNotionalPct).default(0.05),
	priceBandPct: upTo(HARD_CEILINGS.priceBandPct).default(0.01),
	maxIntentAgeMs: upTo(HARD_CEILINGS.maxIntentAgeMs).default(60_000),
	haltAgeMs: upTo(HARD_CEILINGS.haltAgeMs).default(900_000),
	ordersPerMinutePerSymbol: upTo(
		HARD_CEILINGS.ordersPerMinutePerSymbol
	).default(5),
	ordersPerMinuteGlobal: upTo(HARD_CEILINGS.ordersPerMinuteGlobal).default(20),
	/** Same symbol, side and quantity inside this window is a duplicate unless the intent says otherwise. */
	duplicateWindowMs: z.number().int().positive().default(10_000),
	/** A resting order always expires (policy §6). */
	orderTtlMs: z.number().int().positive().default(300_000),
	submitTimeoutMs: z.number().int().positive().default(5_000),
	/** Balance difference accepted by the reconciliation, share of allocated capital (policy §4.3). */
	balanceTolerancePct: z.number().positive().max(0.001).default(0.001),
	feeBps: z.number().nonnegative().default(10),
	/** Simulated slippage of the paper broker, reserved by the balance check. */
	slippageBps: z.number().nonnegative().default(5),
	/** Policy §4.3: 5 failures in 10 min per symbol, 10 across symbols. */
	rejectWindowMs: z.number().int().positive().default(600_000),
	rejectsPerSymbol: z.number().int().positive().max(5).default(5),
	rejectsGlobal: z.number().int().positive().max(10).default(10),
	/** Allow-list of spot instruments and their quantity cap per order. */
	instruments: z
		.record(z.string().min(1), z.object({ maxQuantity: z.number().positive() }))
		.refine(
			(instruments) => Object.keys(instruments).length > 0,
			"at least one instrument"
		),
});
export type RiskLimits = z.output<typeof RiskLimits>;
