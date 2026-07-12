import type { DbConnectionConfig } from "@trading-model/common/domain/db-connection-config";
import {
	DbName,
	DbPassword,
	DbUser,
	Hostname,
	Port,
} from "@trading-model/common/domain/primitives";
import {
	AddressManagerEnvSchema,
	BaseEnvSchema,
	validateEnv,
} from "@trading-model/validation/validation/env";
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
	DB_USER: z.string().default("root"),
	DB_PASSWORD: z.string().default("password"),
	DB_NAME: z.string().default("financial_scraper"),
	DB_HOST: z.string().default("localhost"),
	DB_PORT: z.coerce.number().int().positive().default(3306),
});

export const ENV = validateEnv(FINANCIAL_SCRAPER_ENV_SCHEMA);

export type Env = z.infer<typeof FINANCIAL_SCRAPER_ENV_SCHEMA>;

export const dbConfig: DbConnectionConfig = {
	host: Hostname.of(ENV.DB_HOST),
	port: Port.of(ENV.DB_PORT),
	user: DbUser.of(ENV.DB_USER),
	password: DbPassword.of(ENV.DB_PASSWORD),
	database: DbName.of(ENV.DB_NAME),
};
