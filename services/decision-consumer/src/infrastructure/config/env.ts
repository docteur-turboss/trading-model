import { AddressManagerEnvSchema } from "@trading-model/address-manager/config/address-manager-env";
import { BaseEnvSchema } from "@trading-model/http/config/env";
import { validateEnv } from "@trading-model/http/config/validate-env";
import { RedisEnvSchema } from "@trading-model/persistence/redis-env";
import { z } from "zod";

const DECISION_CONSUMER_ENV_SHAPE = {
	/** Models promoted by hand, `symbol@version` separated by commas (ADR-0087 §2). Empty: nothing decides. */
	PROMOTED_MODELS: z.string().default(""),
	/** Pass over the promoted models, which decides once per closed bar. */
	DECISION_TICK_MS: z.coerce.number().int().positive().default(10_000),
	/** Bars of the window a decision is computed on. */
	DECISION_WINDOW_BARS: z.coerce.number().int().min(50).default(500),
	/** E2E overlay only (ADR-0092): a promoted model decides without `admission.admissible`. Refused in production. */
	DECISION_SKIP_ADMISSION: z.stringbool().default(false),
};

export const ENV = validateEnv(
	BaseEnvSchema.extend(AddressManagerEnvSchema.shape)
		.extend(RedisEnvSchema.shape)
		.extend(DECISION_CONSUMER_ENV_SHAPE)
		.refine(
			(env) => !(env.DECISION_SKIP_ADMISSION && env.NODE_ENV === "production"),
			{
				message: "DECISION_SKIP_ADMISSION is refused in production (ADR-0092)",
				path: ["DECISION_SKIP_ADMISSION"],
			}
		)
);
