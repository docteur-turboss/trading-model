import { validateEnv } from "@trading-model/validation/application/services/validate-env";
import { AddressManagerEnvSchema } from "@trading-model/validation/config/address-manager-env";
import { BaseEnvSchema } from "@trading-model/validation/config/env";
import { z } from "zod";

const MM_EXTRA_SHAPE = {
	OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
} satisfies Record<string, z.ZodTypeAny>;

const MESSAGE_MANAGER_ENV_SCHEMA = BaseEnvSchema.extend(
	AddressManagerEnvSchema.shape
).extend(MM_EXTRA_SHAPE);

export const ENV = validateEnv(MESSAGE_MANAGER_ENV_SCHEMA);
