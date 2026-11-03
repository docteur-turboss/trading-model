import { createDbConfigFromEnv } from "@trading-model/common/config/db-connection-config";
import { createPool, type Pool } from "mysql2";
import { MySqlConnection } from "ts-sql-query/connections/MySqlConnection";
import { MySql2PoolQueryRunner } from "ts-sql-query/queryRunners/MySql2PoolQueryRunner";

const POOL: Pool = createPool({
	...createDbConfigFromEnv(),
	connectionLimit: 10,
	// BIGINT columns (market_trades.trade_id) past Number.MAX_SAFE_INTEGER come
	// back as strings, which ts-sql-query turns into exact bigints.
	supportBigNumbers: true,
});

const POOL_RUNNER = new MySql2PoolQueryRunner(POOL);

const DbConnection = class extends MySqlConnection<"DBConnection"> {
	constructor() {
		super(POOL_RUNNER);
	}
};

export type DBConnection = MySqlConnection<"DBConnection">;

export function createDBConnection(): DBConnection {
	return new DbConnection();
}

/** Shared MySQL connection pool for direct driver access (migrations, raw queries). */
export const DATABASE = POOL;

/**
 * Closes the pool on shutdown: its idle connections keep the event loop
 * alive, so the process would only end at SIGKILL (the grace period).
 */
export async function closeDatabase(): Promise<void> {
	await POOL.promise().end();
}
