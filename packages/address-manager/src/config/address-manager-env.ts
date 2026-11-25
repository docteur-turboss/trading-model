import { normalizeError } from "@trading-model/common/utils/errors";
import { isObject } from "@trading-model/contracts/wire/primitives";
import { logger } from "@trading-model/http/logger";
import { z } from "zod";

/** Environment variables read by the address manager. */
export interface AddressManagerEnv {
	DNS_NAME_MAP?: Record<string, string>;
}

export const AddressManagerEnvSchema = z.object({
	APP_NAME: z.string().min(1),
	APP_VERSION: z.string().default("1.0.0"),
	SERVICE_NAME: z.string().min(1),
	INSTANCE_ID: z.string().min(1),

	DNS_NAME_MAP: z
		.string()
		.default("{}")
		.transform((val) => {
			try {
				const parsed = JSON.parse(val);
				return isObject(parsed) ? (parsed as Record<string, string>) : {};
			} catch (err) {
				logger.warn(
					"Failed to parse DNS_NAME_MAP env var, falling back to {}",
					{
						context: {
							err: normalizeError(err),
						},
					}
				);
				return {};
			}
		}),
});
