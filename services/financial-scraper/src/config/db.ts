import { createDbConfigFromEnv } from "@trading-model/common/domain/db-connection-config";
import { createPool, type Pool } from "mysql2";
import { MySqlConnection } from "ts-sql-query/connections/MySqlConnection";
import { MySql2PoolQueryRunner } from "ts-sql-query/queryRunners/MySql2PoolQueryRunner";

const POOL: Pool = createPool({
	...createDbConfigFromEnv(),
	connectionLimit: 10,
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
