import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "@jest/globals";
import { type Connection, createConnection } from "mysql2/promise";

/**
 * scripts/retention-mysql.sh (ADR-0051) against a real MySQL. The script runs
 * inside the Testcontainers container (it has the `mysql` client and bash), on
 * the test database: the four tables are replaced by ones holding only the
 * columns the job reads (the other specs create their own schema).
 */
const SCRIPT = readFileSync(
	join(__dirname, "../../../../scripts/retention-mysql.sh")
);
const uri = new URL(process.env.TEST_MYSQL_URI as string);
const SCHEMA = uri.pathname.slice(1);
const TABLES = [
	["market_candles", "timestamp"],
	["market_trades", "timestamp"],
	["market_tickers", "timestamp"],
	["signals", "observed_at"],
] as const;

let db: Connection;
let container: string;

function containerOfPort(port: string): string {
	const lines = execFileSync("docker", ["ps", "--format", "{{.ID}} {{.Ports}}"])
		.toString()
		.split("\n");
	const line = lines.find((l) => l.includes(`:${port}->`));
	if (!line) {
		throw new Error(`no container publishes port ${port}`);
	}
	return line.split(" ")[0];
}

/** Runs the script; returns its exit code and output. */
function retention(env: Record<string, string> = {}): {
	code: number;
	output: string;
} {
	const args = ["exec", "-i"];
	const vars = {
		MYSQL_HOST: "127.0.0.1",
		MYSQL_USER: decodeURIComponent(uri.username),
		MYSQL_PWD: decodeURIComponent(uri.password),
		MYSQL_DATABASE: SCHEMA,
		RETENTION_PAUSE_SECONDS: "0",
		...env,
	};
	for (const [k, v] of Object.entries(vars)) {
		args.push("-e", `${k}=${v}`);
	}
	args.push(container, "bash", "-s");
	try {
		const output = execFileSync("docker", args, {
			input: SCRIPT,
			stdio: ["pipe", "pipe", "pipe"],
		}).toString();
		return { code: 0, output };
	} catch (err) {
		const e = err as { status: number; stdout: Buffer; stderr: Buffer };
		return { code: e.status, output: `${e.stdout}${e.stderr}` };
	}
}

async function insertAged(table: string, column: string, ageDays: number) {
	await db.query(
		`INSERT INTO \`${table}\` (\`${column}\`) VALUES (UTC_TIMESTAMP(3) - INTERVAL ? DAY)`,
		[ageDays]
	);
}

async function count(table: string): Promise<number> {
	const [rows] = await db.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
	return (rows as { n: number }[])[0].n;
}

beforeAll(async () => {
	container = containerOfPort(uri.port);
	db = await createConnection({ uri: process.env.TEST_MYSQL_URI });
	await db.query("SET FOREIGN_KEY_CHECKS = 0");
	for (const [table, column] of TABLES) {
		await db.query(`DROP TABLE IF EXISTS \`${table}\``);
		// Keep the index INVISIBLE (as before migration 007, or after a rollback): the job must cope.
		await db.query(
			`CREATE TABLE \`${table}\` (id INT AUTO_INCREMENT PRIMARY KEY, \`${column}\` DATETIME(3) NOT NULL, INDEX idx_t (\`${column}\`) INVISIBLE)`
		);
	}
});

beforeEach(async () => {
	for (const [table] of TABLES) {
		await db.query(`TRUNCATE \`${table}\``);
	}
});

afterAll(async () => {
	for (const [table] of TABLES) {
		await db.query(`DROP TABLE IF EXISTS \`${table}\``);
	}
	await db.end();
});

describe("scripts/retention-mysql.sh — real MySQL", () => {
	it("should delete only rows older than the retention period, across several batches", async () => {
		for (const [table, column] of TABLES) {
			for (let i = 0; i < 5; i++) {
				await insertAged(table, column, 2000 + i);
			}
			await insertAged(table, column, 1826);
			await insertAged(table, column, 1);
		}

		const { code, output } = retention({ RETENTION_BATCH_SIZE: "2" });

		expect(code).toBe(0);
		expect(output).toContain("market_candles: 5 rows");
		for (const [table] of TABLES) {
			expect(await count(table)).toBe(2);
		}
	});

	it("should be idempotent: a second run deletes nothing", async () => {
		await insertAged("market_trades", "timestamp", 3000);
		retention();

		const { code, output } = retention();

		expect(code).toBe(0);
		expect(output).toContain("market_trades: 0 rows");
	});

	it("should purge signals on RETENTION_SIGNALS_DAYS and market data on RETENTION_DAYS", async () => {
		await insertAged("market_candles", "timestamp", 60);
		await insertAged("signals", "observed_at", 60);

		retention({ RETENTION_DAYS: "100", RETENTION_SIGNALS_DAYS: "30" });

		expect(await count("market_candles")).toBe(1);
		expect(await count("signals")).toBe(0);
	});

	it("should publish metrics and keep the last success time when a table fails", async () => {
		const file = "/tmp/retention-spec.prom";
		const metrics = () =>
			execFileSync("docker", ["exec", container, "cat", file]).toString();
		await insertAged("market_candles", "timestamp", 3000);
		retention({ METRICS_FILE: file });
		const first = metrics();
		expect(first).toContain(
			'retention_last_run_rows_deleted{table="market_candles"} 1'
		);
		expect(first).toContain("retention_last_status 1");
		const success = /retention_last_success_timestamp (\d+)/.exec(first)?.[1];

		await db.query("RENAME TABLE signals TO signals_off");
		try {
			retention({ METRICS_FILE: file });
		} finally {
			await db.query("RENAME TABLE signals_off TO signals");
		}

		expect(metrics()).toContain("retention_last_status 0");
		expect(metrics()).toContain(`retention_last_success_timestamp ${success}`);
	});

	it("should refuse an invalid duration before any delete", async () => {
		await insertAged("market_candles", "timestamp", 3000);

		const { code, output } = retention({ RETENTION_DAYS: "0" });

		expect(code).toBe(1);
		expect(output).toContain("RETENTION_DAYS must be >= 1");
		expect(await count("market_candles")).toBe(1);
	});

	it("should keep purging the other tables and exit 1 when one table fails", async () => {
		await db.query("RENAME TABLE market_trades TO market_trades_off");
		try {
			await insertAged("signals", "observed_at", 3000);

			const { code, output } = retention();

			expect(code).toBe(1);
			expect(output).toContain("ERROR market_trades");
			expect(await count("signals")).toBe(0);
		} finally {
			await db.query("RENAME TABLE market_trades_off TO market_trades");
		}
	});
});
