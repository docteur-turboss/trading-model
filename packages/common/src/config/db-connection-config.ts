import type { DbConnectionConfig } from "../domain/db-connection-config";
import {
	DbName,
	DbPassword,
	DbUser,
	Hostname,
	Port,
} from "../domain/primitives";

/**
 * Builds a {@link DbConnectionConfig} from `process.env` (`DB_HOST`, `DB_PORT`,
 * `DB_USER`, `DB_PASSWORD`, `DB_NAME`) with sane defaults for local dev.
 *
 * Reads environment variables — an infrastructure/config concern, hence it lives
 * in `config/` rather than the pure `domain/` layer.
 */
export function createDbConfigFromEnv(
	overrides?: Partial<DbConnectionConfig>
): DbConnectionConfig {
	return {
		host: Hostname.of(process.env.DB_HOST ?? "127.0.0.1"),
		port: Port.of(Number(process.env.DB_PORT) || 3306),
		user: DbUser.of(process.env.DB_USER ?? "root"),
		password: DbPassword.of(process.env.DB_PASSWORD ?? ""),
		database: DbName.of(process.env.DB_NAME ?? "financial_scraper"),
		...overrides,
	};
}
