import { createPool, type Pool } from "mysql2";
import { MySqlConnection } from "ts-sql-query/connections/MySqlConnection";
import { MySql2PoolQueryRunner } from "ts-sql-query/queryRunners/MySql2PoolQueryRunner";

import { env } from "./env";

// Centralises MySQL connection parameters from validated environment variables.
const POOL: Pool = createPool({
	user: env.DB_USER,
	password: env.DB_PASSWORD,
	database: env.DB_NAME,
	host: env.DB_HOST,
	port: env.DB_PORT,
	connectionLimit: 10,
});

// --- Project-specific connection class ---
// DBConnection extends MySqlConnection provided by ts-sql-query.
// The pool is associated with the MySql2 query runner to execute queries.
/** MySQL database connection backed by a pooled ts-sql-query runner. */
export class DBConnection extends MySqlConnection<"DBConnection"> {
	constructor() {
		super(new MySql2PoolQueryRunner(POOL));
	}
}

/** Shared MySQL connection pool for direct driver access (migrations, raw queries). */
export const DATABASE = POOL;
