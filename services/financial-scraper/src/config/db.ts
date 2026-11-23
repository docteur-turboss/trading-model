import { createDbConfigFromEnv } from "@trading-model/common/config/db-connection-config";
import { createPool, type Pool } from "mysql2";
import { MySqlConnection } from "ts-sql-query/connections/MySqlConnection";
import { MySql2PoolQueryRunner } from "ts-sql-query/queryRunners/MySql2PoolQueryRunner";

/** Longest legitimate read (paginated SELECT); the server aborts it past this. */
const QUERY_TIMEOUT_MS = 30_000;
/** Longest wait for a free pool connection before the caller gets an error. */
const ACQUIRE_TIMEOUT_MS = 10_000;
const CONNECT_TIMEOUT_MS = 10_000;

const POOL: Pool = createPool({
	...createDbConfigFromEnv(),
	connectionLimit: 10,
	// Fail past 100 waiting queries (10x the pool) instead of queueing without bound.
	queueLimit: 100,
	connectTimeout: CONNECT_TIMEOUT_MS,
	// BIGINT columns (market_trades.trade_id) past Number.MAX_SAFE_INTEGER come
	// back as strings, which ts-sql-query turns into exact bigints.
	supportBigNumbers: true,
	// DATETIME columns hold UTC: do not follow the container TZ (driver default "local").
	timezone: "Z",
});

// max_execution_time bounds SELECTs only: batch upserts and retention stay unbounded
// (InnoDB lock waits already end at innodb_lock_wait_timeout).
POOL.on("connection", (connection) => {
	connection.query(
		`SET SESSION max_execution_time = ${QUERY_TIMEOUT_MS}`,
		(error) => {
			if (error) {
				connection.destroy();
			}
		}
	);
});

// mysql2 has no acquire timeout: bound the wait for a connection here. A
// connection that arrives after the deadline goes straight back to the pool.
const GET_CONNECTION = POOL.getConnection.bind(POOL) as (
	cb: Parameters<Pool["getConnection"]>[0]
) => void;
POOL.getConnection = ((cb: Parameters<Pool["getConnection"]>[0]) => {
	let expired = false;
	const timer = setTimeout(() => {
		expired = true;
		cb(
			new Error(`MySQL pool: no connection within ${ACQUIRE_TIMEOUT_MS} ms`),
			undefined as never
		);
	}, ACQUIRE_TIMEOUT_MS);
	GET_CONNECTION((error, connection) => {
		clearTimeout(timer);
		if (expired) {
			connection?.release();
			return;
		}
		cb(error, connection);
	});
}) as Pool["getConnection"];

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
