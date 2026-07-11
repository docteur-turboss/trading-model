import { DbName, DbPassword, DbUser, Hostname, Port } from "./primitives";

export interface DbConnectionConfig {
	host: Hostname;
	port: Port;
	user: DbUser;
	password: DbPassword;
	database: DbName;
}

export function createDbConfigFromEnv(
	overrides?: Partial<DbConnectionConfig>
): DbConnectionConfig {
	return {
		host: Hostname.of(process.env.DB_HOST ?? "127.0.0.1"),
		port: Port.of(Number(process.env.DB_PORT) || 3306),
		user: DbUser.of(process.env.DB_USER ?? "root"),
		password: DbPassword.of(process.env.DB_PASSWORD ?? ""),
		database: DbName.of(process.env.DB_NAME ?? "trading_model"),
		...overrides,
	};
}
