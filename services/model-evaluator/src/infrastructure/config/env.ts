import { AddressManagerEnvSchema } from "@trading-model/address-manager/config/address-manager-env";
import { BaseEnvSchema } from "@trading-model/http/config/env";
import { validateEnv } from "@trading-model/http/config/validate-env";
import { BusEnvSchema } from "@trading-model/persistence/redis-env";
import { z } from "zod";

const MODEL_EVALUATOR_ENV_SHAPE = {
	/** Directory of the evaluation records (a PVC in K8s): one file per (symbol, version). */
	EVALUATIONS_DIR: z.string().min(1).default("/data/evaluations"),
	/** Model artifacts of the trainer, mounted read-only (ADR-0022, ADR-0089). */
	TRAINER_MODEL_DIR: z.string().min(1).default("/data/checkpoints/models"),
};

export const ENV = validateEnv(
	BaseEnvSchema.extend(AddressManagerEnvSchema.shape)
		.extend(BusEnvSchema.shape)
		.extend(MODEL_EVALUATOR_ENV_SHAPE)
);
