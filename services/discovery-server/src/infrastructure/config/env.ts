import { validateEnv } from "@trading-model/validation/application/services/validate-env";
import { BaseEnvSchema } from "@trading-model/validation/config/env";
import { z } from "zod";

const DISCOVERY_EXTRA = {
	CLEANUP_SERVICE_INTERVAL_MS: z.coerce
		.number()
		.int()
		.positive()
		.default(1_000 * 60 * 10),
	ERROR_URL_WEBHOOK: z.union([z.string().url(), z.literal("")]).default(""),
	SIGNING_SECRET: z.string().min(1).optional(),
	REDIS_URL: z.string().optional(),
	REGISTRATION_TOKEN: z.string().min(1).optional(),
	ALLOWED_REGISTRATION_CIDRS: z
		.string()
		.default("10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.0/8"),
} satisfies Record<string, z.ZodTypeAny>;

const DISCOVERY_ENV_SCHEMA = BaseEnvSchema.extend(DISCOVERY_EXTRA).superRefine(
	(data, ctx) => {
		if (data.NODE_ENV === "production") {
			if (!data.REGISTRATION_TOKEN) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message:
						"REGISTRATION_TOKEN is required in production — set it in your environment",
					path: ["REGISTRATION_TOKEN"],
				});
			}
			if (!data.ALLOWED_REGISTRATION_CIDRS) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "ALLOWED_REGISTRATION_CIDRS cannot be empty in production",
					path: ["ALLOWED_REGISTRATION_CIDRS"],
				});
			}
		}
	}
);

export const ENV = validateEnv(DISCOVERY_ENV_SCHEMA);
