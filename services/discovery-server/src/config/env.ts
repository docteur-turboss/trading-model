import {
	BaseEnvSchema,
	validateEnv,
} from "@trading-model/validation/validation/env";
import { z } from "zod";

const DISCOVERY_EXTRA = {
	CLEANUP_SERVICE_INTERVAL_MS: z.coerce
		.number()
		.int()
		.positive()
		.default(1_000 * 60 * 10),
	ERROR_URL_WEBHOOK: z.union([z.string().url(), z.literal("")]).default(""),
} satisfies Record<string, z.ZodTypeAny>;

const DISCOVERY_ENV_SCHEMA = BaseEnvSchema.extend(DISCOVERY_EXTRA);

export const ENV = validateEnv(DISCOVERY_ENV_SCHEMA);
