import { AddressManagerEnvSchema } from "@trading-model/address-manager/config/address-manager-env";
import { BaseEnvSchema } from "@trading-model/http/config/env";
import { validateEnv } from "@trading-model/http/config/validate-env";
import { BusEnvSchema } from "@trading-model/persistence/redis-env";
import { z } from "zod";

const DECISION_CONSUMER_ENV_SHAPE = {
	/** Models promoted by hand, `symbol@version` separated by commas (ADR-0087 §2). Empty: nothing decides. */
	PROMOTED_MODELS: z.string().default(""),
	/** Pass over the promoted models, which decides once per closed bar. */
	DECISION_TICK_MS: z.coerce.number().int().positive().default(10_000),
	/** Bars of the window a decision is computed on. */
	DECISION_WINDOW_BARS: z.coerce.number().int().min(50).default(500),
};

export const ENV = validateEnv(
	BaseEnvSchema.extend(AddressManagerEnvSchema.shape)
		.extend(BusEnvSchema.shape)
		.extend(DECISION_CONSUMER_ENV_SHAPE)
);
