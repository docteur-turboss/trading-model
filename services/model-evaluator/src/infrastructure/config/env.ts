import { validateEnv } from "@trading-model/validation/application/services/validate-env";
import { AddressManagerEnvSchema } from "@trading-model/validation/config/address-manager-env";
import { BaseEnvSchema } from "@trading-model/validation/config/env";
import { z } from "zod";

const MODEL_EVALUATOR_ENV_SHAPE = {
	/** Directory of the evaluation records (a PVC in K8s): one file per (symbol, version). */
	EVALUATIONS_DIR: z.string().min(1).default("/data/evaluations"),
};

export const ENV = validateEnv(
	BaseEnvSchema.extend(AddressManagerEnvSchema.shape).extend(
		MODEL_EVALUATOR_ENV_SHAPE
	)
);
