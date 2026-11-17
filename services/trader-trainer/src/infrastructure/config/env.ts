import { AddressManagerEnvSchema } from "@trading-model/validation/config/address-manager-env";
import { BaseEnvSchema } from "@trading-model/validation/config/env";
import { featureFlag } from "@trading-model/validation/config/feature-flags";
import { RedisEnvSchema } from "@trading-model/validation/config/redis-env";
import { validateEnv } from "@trading-model/validation/config/validate-env";
import { z } from "zod";
import { FitnessType } from "../../domain/genetic-algorithm/genome-control";
import {
	parseSignalKeys,
	SIGNAL_KEY_PATTERN,
} from "../../domain/signal-features";

const TRAINER_ENV_SHAPE = {
	TRAINER_SYMBOLS: z.string().default("BTCUSDT,ETHUSDT"),
	/** `SYMBOL:ASSET` pairs (`BTCUSDT:BTC,ETHUSDT:ETH`): the registry asset whose signals a session reads. Empty: none (ADR-0036). */
	TRAINER_SYMBOL_ASSETS: z.string().default(""),
	/** `SUBJECT:dimension:metric` list (`BTC:social:pageviews`): the signals fed to the network as value, age and confidence inputs (ADR-0081). Used only with FEATURE_SIGNAL_INPUTS. */
	TRAINER_SIGNAL_FEATURES: z
		.string()
		.default("")
		.refine(
			(csv) =>
				parseSignalKeys(csv).every((key) => SIGNAL_KEY_PATTERN.test(key)),
			"TRAINER_SIGNAL_FEATURES: each key must be SUBJECT:dimension:metric"
		),
	/** Feature flag (ADR-0039): false keeps the network input at the market values. */
	FEATURE_SIGNAL_INPUTS: featureFlag(false),
	/** Feature flag (ADR-0039, ADR-0082): true lets the GA evolve a mask over the input groups; false: no mask, training unchanged. */
	FEATURE_INPUT_MASK_GENE: featureFlag(false),
	/** ADR-0082: true keeps the candle group active in every evolved mask; read only with FEATURE_INPUT_MASK_GENE. */
	TRAINER_INPUT_MASK_PROTECT_CANDLE: featureFlag(false),
	/** Model artifacts (ADR-0022): on the checkpoint volume shared by the replicas. */
	TRAINER_MODEL_DIR: z.string().min(1).default("/data/checkpoints/models"),
	TRAINER_MODEL_RETENTION: z.coerce.number().int().min(1).default(20),
	/** Services allowed to download model weights; empty: nobody. */
	MODEL_DOWNLOAD_CALLERS: z.string().default(""),
	TRAINER_DATA_WINDOW: z.coerce.number().int().positive().default(500),
	TRAINER_VALIDATION_SPLIT: z.coerce.number().gt(0).lt(1).default(0.15),
	/** Newest fraction never used by training nor selection; published metrics come from it (ADR-0068). */
	TRAINER_TEST_SPLIT: z.coerce.number().gt(0).lt(1).default(0.15),
	TRAINER_WALK_FORWARD_FOLDS: z.coerce.number().int().min(1).max(20).default(1),
	TRAINER_GENERATIONS: z.coerce.number().int().positive().default(50),
	TRAINER_POPULATION_SIZE: z.coerce.number().int().positive().default(20),
	TRAINER_TIME_BUDGET_MS: z.coerce.number().int().positive().default(300000),
	/** Time between two training sessions (1 h: one new candle per 1-min session was not worth a full retrain, 20 models then cover 20 h). Keep well above TRAINER_TIME_BUDGET_MS. */
	TRAINER_INTERVAL_MS: z.coerce.number().int().positive().default(3600000),
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
	/** Feature flag (ADR-0039, fitness override): false forces `total_pnl` whatever TRAINER_FITNESS_TYPE says. */
	FEATURE_RISK_ADJUSTED_FITNESS: featureFlag(true),
	/** Feature flag (ADR-0039): true lets the GA choose the action space (partial order sizes). */
	FEATURE_ACTION_SPACE_GENE: featureFlag(false),
	/** Feature flag (ADR-0039): true makes the agent decide on market events, not every bar (ADR-0076 §5). */
	FEATURE_EVENT_DRIVEN_DECISIONS: featureFlag(false),
	/** Show the agent its position; false to measure what it is worth (ADR-0025). */
	TRAINER_OBSERVE_POSITION: z.stringbool().default(true),
	/**
	 * Kubernetes Lease the trainer pods compete for (ADR-0058): only its holder
	 * trains. Empty: no election, this instance trains (compose, dev).
	 */
	TRAINER_LEASE_NAME: z.string().trim().default(""),
} satisfies Record<string, z.ZodTypeAny>;

export const TRADER_TRAINER_ENV_SCHEMA = BaseEnvSchema.merge(
	AddressManagerEnvSchema
)
	.extend(RedisEnvSchema.shape)
	.extend(TRAINER_ENV_SHAPE);

export const ENV = validateEnv(TRADER_TRAINER_ENV_SCHEMA);
