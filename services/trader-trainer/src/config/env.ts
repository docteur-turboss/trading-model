import {
	AddressManagerEnvSchema,
	BaseEnvSchema,
	validateEnv,
} from "@trading-model/common/validation/env";
import { z } from "zod";

const TRAINER_ENV_SHAPE = {
	TRAINER_SYMBOLS: z.string().default("BTCUSDT,ETHUSDT"),
	TRAINER_DATA_WINDOW: z.coerce.number().int().positive().default(500),
	TRAINER_VALIDATION_SPLIT: z.coerce.number().min(0).max(1).default(0.2),
	TRAINER_GENERATIONS: z.coerce.number().int().positive().default(50),
	TRAINER_POPULATION_SIZE: z.coerce.number().int().positive().default(20),
	TRAINER_TIME_BUDGET_MS: z.coerce.number().int().positive().default(300000),
	TRAINER_EPISODES_PER_INDIVIDUAL: z.coerce
		.number()
		.int()
		.positive()
		.default(3),
} satisfies Record<string, z.ZodTypeAny>;

const TRADER_TRAINER_ENV_SCHEMA = BaseEnvSchema.merge(
	AddressManagerEnvSchema
).extend(TRAINER_ENV_SHAPE);

export type Env = z.infer<typeof TRADER_TRAINER_ENV_SCHEMA>;

export const env = validateEnv(TRADER_TRAINER_ENV_SCHEMA);
