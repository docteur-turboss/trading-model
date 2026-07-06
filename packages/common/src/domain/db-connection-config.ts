import type { IPAddress, Port } from "./primitives";
import type { HostPort } from "./service-identity";

export interface DbConnectionConfig extends HostPort {
	user: string;
	password: string;
	database: string;
}

export function createDbConfigFromEnv(
	overrides?: Partial<DbConnectionConfig>
): DbConnectionConfig {
	return {
		host: (process.env.DB_HOST ?? "localhost") as IPAddress,
		port: (Number(process.env.DB_PORT) || 3306) as Port,
		user: process.env.DB_USER ?? "root",
		password: process.env.DB_PASSWORD ?? "",
		database: process.env.DB_NAME ?? "trading_model",
		...overrides,
	};
}
