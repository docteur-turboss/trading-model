import { createPool, type Pool } from "mysql2";
import { MySqlConnection } from "ts-sql-query/connections/MySqlConnection";
import { MySql2PoolQueryRunner } from "ts-sql-query/queryRunners/MySql2PoolQueryRunner";

import { dbConfig } from "./env";

const POOL: Pool = createPool({
	...dbConfig,
	connectionLimit: 10,
});

/** MySQL database connection backed by a pooled ts-sql-query runner. */
export class DBConnection extends MySqlConnection<"DBConnection"> {
	constructor() {
		super(new MySql2PoolQueryRunner(POOL));
	}
}

/** Shared MySQL connection pool for direct driver access (migrations, raw queries). */
export const DATABASE = POOL;
