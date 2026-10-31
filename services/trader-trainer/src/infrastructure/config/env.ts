import { validateEnv } from "@trading-model/validation/application/services/validate-env";
import { AddressManagerEnvSchema } from "@trading-model/validation/config/address-manager-env";
import { BaseEnvSchema } from "@trading-model/validation/config/env";
import { RedisEnvSchema } from "@trading-model/validation/config/redis-env";
import { z } from "zod";
import { FitnessType } from "../../domain/genetic-algorithm/genome-control";

const TRAINER_ENV_SHAPE = {
	TRAINER_SYMBOLS: z.string().default("BTCUSDT,ETHUSDT"),
	/** Model artifacts (ADR-0022): on the checkpoint volume shared by the replicas. */
	TRAINER_MODEL_DIR: z.string().min(1).default("/data/checkpoints/models"),
	TRAINER_MODEL_RETENTION: z.coerce.number().int().min(1).default(20),
	/** Services allowed to download model weights; empty: nobody. */
	MODEL_DOWNLOAD_CALLERS: z.string().default(""),
	TRAINER_DATA_WINDOW: z.coerce.number().int().positive().default(500),
	TRAINER_VALIDATION_SPLIT: z.coerce.number().min(0).max(1).default(0.2),
	TRAINER_WALK_FORWARD_FOLDS: z.coerce.number().int().min(1).max(20).default(1),
	TRAINER_GENERATIONS: z.coerce.number().int().positive().default(50),
	TRAINER_POPULATION_SIZE: z.coerce.number().int().positive().default(20),
	TRAINER_TIME_BUDGET_MS: z.coerce.number().int().positive().default(300000),
	/** Newest candle older than this: the symbol is not trained (15 min, like MarketDataStale). */
	TRAINER_MAX_DATA_AGE_MS: z.coerce.number().int().positive().default(900000),
	/** At least 10: the risk ratios and the drawdown need several episodes. */
	TRAINER_EPISODES_PER_INDIVIDUAL: z.coerce
		.number()
		.int()
		.positive()
		.default(10),
	/** Scalar fitness of the GA (ADR-0025). */
	TRAINER_FITNESS_TYPE: z.enum(FitnessType).default(FitnessType.TotalPnl),
	/** Show the agent its position; false to measure what it is worth (ADR-0025). */
	TRAINER_OBSERVE_POSITION: z.stringbool().default(true),
} satisfies Record<string, z.ZodTypeAny>;

/** Redis: the address-manager cache shared by the replicas (ADR-0029). */
const TRADER_TRAINER_ENV_SCHEMA = BaseEnvSchema.merge(AddressManagerEnvSchema)
	.extend(RedisEnvSchema.shape)
	.extend(TRAINER_ENV_SHAPE);

export const ENV = validateEnv(TRADER_TRAINER_ENV_SCHEMA);
