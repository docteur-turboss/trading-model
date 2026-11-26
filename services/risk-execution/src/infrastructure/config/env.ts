import { AddressManagerEnvSchema } from "@trading-model/address-manager/config/address-manager-env";
import { BaseEnvSchema } from "@trading-model/http/config/env";
import { validateEnv } from "@trading-model/http/config/validate-env";
import { RedisEnvSchema } from "@trading-model/persistence/redis-env";
import { z } from "zod";

const RISK_EXECUTION_ENV_SHAPE = {
	/** `paper` unless the production overlay says otherwise (ADR-0064 §6). */
	EXECUTION_MODE: z.enum(["paper", "live"]).default("paper"),
	/** The deployment, which NODE_ENV does not tell: every K8s environment runs NODE_ENV=production. */
	DEPLOYMENT_ENV: z
		.enum(["development", "ci", "staging", "production"])
		.default("development"),
	/** Live broker keys: only the production Secret holds them; never set in paper mode. */
	BROKER_API_KEY: z.string().min(1).optional(),
	BROKER_API_SECRET: z.string().min(1).optional(),
	/** Model artifacts of the trainer, mounted read-only (ADR-0022, ADR-0089). */
	TRAINER_MODEL_DIR: z.string().min(1).default("/data/checkpoints/models"),
	/** Directory of the durable state (a PVC in K8s): kill switch, orders, paper ledger. */
	RISK_STATE_DIR: z.string().min(1).default("/data/risk-execution"),
	/** Allocated capital of the mode (policy §2). */
	RISK_ALLOCATED_CAPITAL: z.coerce.number().positive().default(10_000),
	/** JSON allow-list of spot instruments with their quantity cap per order. */
	RISK_INSTRUMENTS: z
		.string()
		.min(2)
		.default('{"BTCUSDT":{"maxQuantity":0.01}}'),
	/** Other caps of ADR-0064 §2, a JSON object of RiskLimits overrides (at or below their hard ceiling). */
	RISK_LIMITS_JSON: z.string().default("{}"),
	/** Only this actor re-arms after the drawdown stop (policy §4.4). */
	RISK_OWNER_ACTOR: z.string().min(1).default("owner"),
	RISK_TICK_MS: z.coerce.number().int().positive().default(10_000),
	/** E2E overlay only (ADR-0090): every model passes the admission check. Refused in production. */
	DECISION_SKIP_ADMISSION: z.stringbool().default(false),
};

export const ENV = validateEnv(
	BaseEnvSchema.extend(AddressManagerEnvSchema.shape)
		.extend(RedisEnvSchema.shape)
		.extend(RISK_EXECUTION_ENV_SHAPE)
		.refine(
			(env) => !(env.DECISION_SKIP_ADMISSION && env.NODE_ENV === "production"),
			{
				message: "DECISION_SKIP_ADMISSION is refused in production (ADR-0090)",
				path: ["DECISION_SKIP_ADMISSION"],
			}
		)
);
