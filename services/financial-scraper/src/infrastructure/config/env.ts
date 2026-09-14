import { validateEnv } from "@trading-model/validation/application/services/validate-env";
import { AddressManagerEnvSchema } from "@trading-model/validation/config/address-manager-env";
import { BaseEnvSchema } from "@trading-model/validation/config/env";
import { z } from "zod";

const FINANCIAL_SCRAPER_ENV_SCHEMA = BaseEnvSchema.extend(
	AddressManagerEnvSchema.shape
).extend({
	BINANCE_API_KEY: z.string().default(""),
	BINANCE_API_SECRET: z.string().default(""),
	SYMBOLS_TO_TRACK: z
		.string()
		.default("[]")
		.transform((val) => {
			try {
				const parsed = JSON.parse(val);
				return Array.isArray(parsed) ? parsed.map(String) : [];
			} catch {
				return [];
			}
		}),
	SCRAPE_INTERVAL: z.string().default("*/1 * * * *"),
});

export const ENV = validateEnv(FINANCIAL_SCRAPER_ENV_SCHEMA);
