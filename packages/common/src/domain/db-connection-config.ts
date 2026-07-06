export interface DbConnectionConfig {
	host: string;
	port: number;
	user: string;
	password: string;
	database: string;
}

export function createDbConfigFromEnv(
	overrides?: Partial<DbConnectionConfig>
): DbConnectionConfig {
	return {
		host: process.env.DB_HOST ?? "localhost",
		port: Number(process.env.DB_PORT) || 3306,
		user: process.env.DB_USER ?? "root",
		password: process.env.DB_PASSWORD ?? "",
		database: process.env.DB_NAME ?? "trading_model",
		...overrides,
	};
}
