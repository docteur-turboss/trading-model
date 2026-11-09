import { readFileSync } from "node:fs";
import type { DbConnectionConfig } from "@trading-model/primitives/db-connection-config";
import {
	DbName,
	DbPassword,
	DbUser,
	Hostname,
	Port,
} from "@trading-model/primitives/primitives";

/**
 * Builds a {@link DbConnectionConfig} from `process.env` (`DB_HOST`, `DB_PORT`,
 * `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL_CA`, `DB_SSL_CERT`, `DB_SSL_KEY`) with sane defaults for
 * local dev.
 *
 * `DB_SSL_CA` is the path of the PEM CA that signed the server certificate:
 * when set, the connection uses TLS and verifies the certificate and the host
 * name. An unreadable file throws: the service must not start in plain text
 * when TLS was asked for. `DB_SSL_CERT` and `DB_SSL_KEY` (paths) are the client
 * certificate of the MySQL user (issue #767): both or none.
 *
 * Reads environment variables — an infrastructure/config concern, hence it lives
 * in `config/` rather than the pure `domain/` layer.
 */
export function createDbConfigFromEnv(
	overrides?: Partial<DbConnectionConfig>
): DbConnectionConfig {
	const {
		DB_SSL_CA: caPath,
		DB_SSL_CERT: certPath,
		DB_SSL_KEY: keyPath,
	} = process.env;
	if (Boolean(certPath) !== Boolean(keyPath)) {
		throw new Error("DB_SSL_CERT and DB_SSL_KEY must be set together");
	}
	return {
		host: Hostname.of(process.env.DB_HOST ?? "127.0.0.1"),
		port: Port.of(Number(process.env.DB_PORT) || 3306),
		user: DbUser.of(process.env.DB_USER ?? "root"),
		password: DbPassword.of(process.env.DB_PASSWORD ?? ""),
		database: DbName.of(process.env.DB_NAME ?? "financial_scraper"),
		...(caPath
			? {
					ssl: {
						ca: readFileSync(caPath, "utf8"),
						...(certPath && keyPath
							? {
									cert: readFileSync(certPath, "utf8"),
									key: readFileSync(keyPath, "utf8"),
								}
							: {}),
					},
				}
			: {}),
		...overrides,
	};
}
