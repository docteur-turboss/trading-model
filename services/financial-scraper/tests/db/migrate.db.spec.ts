import { readdirSync, rmSync, writeFileSync } from "node:fs";
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
import { createMigrateRunner } from "./migrate-runner";

/** scripts/migrate.mjs on fixture migrations (ADR-0040): lock, resume, checksum. */
const runner = createMigrateRunner();
let db: Connection;

function writeMigration(file: string, sql: string): void {
	writeFileSync(join(runner.migrationsDir, file), sql);
}

async function rows<T>(sql: string): Promise<T[]> {
	const [result] = await db.query(sql);
	return result as T[];
}

const appliedIds = async () =>
	(await rows<{ id: string }>("SELECT id FROM _migrations ORDER BY id")).map(
		(row) => row.id
	);
const steps = () =>
	rows<{ migration_id: string; step: number }>(
		"SELECT migration_id, step FROM _migration_steps ORDER BY step"
	);

beforeAll(async () => {
	db = await createConnection({ uri: process.env.TEST_MYSQL_URI });
	// The other spec may leave its schema behind, foreign keys included.
	await db.query("SET FOREIGN_KEY_CHECKS = 0");
});

beforeEach(async () => {
	for (const file of readdirSync(runner.migrationsDir)) {
		rmSync(join(runner.migrationsDir, file));
	}
	const tables = await rows<{ name: string }>(
		"SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()"
	);
	for (const { name } of tables) {
		await db.query(`DROP TABLE \`${name}\``);
	}
});

afterAll(async () => {
	await db.end();
	runner.cleanup();
});

describe("scripts/migrate.mjs — real MySQL", () => {
	it("should fail instead of connecting in plain when DB_SSL_CA is unreadable", async () => {
		process.env.DB_SSL_CA = join(runner.migrationsDir, "missing-ca.crt");
		try {
			const result = await runner.runAsync("status");
			expect(result.code).toBe(1);
			expect(result.output).toContain("ENOENT");
		} finally {
			delete process.env.DB_SSL_CA;
		}
	});

	it("should resume a migration that failed at its 2nd statement without replaying the 1st", async () => {
		const create =
			"-- a ; in a comment\nCREATE TABLE fx_a (id INT PRIMARY KEY, label VARCHAR(20) DEFAULT 'x;y');\n";
		writeMigration(
			"001_fixture.up.sql",
			`${create}ALTER TABLE fx_a DROP COLUMN missing;\n`
		);

		const first = await runner.runAsync("up");
		expect(first.code).toBe(1);
		expect(first.output).toContain("statement 2/2 failed");
		await expect(appliedIds()).resolves.toEqual([]);
		await expect(steps()).resolves.toEqual([
			{ migration_id: "001_fixture", step: 0 },
		]);

		// Rerun as is: resumes at the failing statement, CREATE TABLE is not replayed.
		const second = await runner.runAsync("up");
		expect(second.code).toBe(1);
		expect(second.output).toContain("resuming at statement 2/2");
		expect(second.output).toContain("statement 2/2 failed");
		expect(second.output).not.toContain("already exists");

		// A statement that already ran may not change.
		writeMigration(
			"001_fixture.up.sql",
			`${create.replace("20", "30")}ALTER TABLE fx_a DROP COLUMN missing;\n`
		);
		const edited = await runner.runAsync("up");
		expect(edited.code).toBe(1);
		expect(edited.output).toContain("statement 1 already ran");

		// The failed one may: fixed, the migration completes.
		writeMigration(
			"001_fixture.up.sql",
			`${create}ALTER TABLE fx_a ADD COLUMN note INT;\n`
		);
		const fixed = await runner.runAsync("up");
		expect(fixed).toMatchObject({ code: 0 });
		await expect(appliedIds()).resolves.toEqual(["001_fixture"]);
		await expect(steps()).resolves.toEqual([]);
		await expect(rows("SELECT id, label, note FROM fx_a")).resolves.toEqual([]);
	});

	it("should refuse up when an applied migration's file changed", async () => {
		writeMigration("001_fixture.up.sql", "CREATE TABLE fx_a (id INT);\n");
		runner.run("up");
		writeMigration(
			"001_fixture.up.sql",
			"CREATE TABLE fx_a (id INT);\n-- edited after it ran\n"
		);
		writeMigration("002_fixture.up.sql", "CREATE TABLE fx_b (id INT);\n");

		const result = await runner.runAsync("up");
		expect(result.code).toBe(1);
		expect(result.output).toContain(
			"Applied migrations changed since they ran: 001_fixture"
		);
		await expect(appliedIds()).resolves.toEqual(["001_fixture"]);
	});

	it("should serialize two concurrent up runs with the lock", async () => {
		writeMigration(
			"001_fixture.up.sql",
			"DO SLEEP(2);\nCREATE TABLE fx_a (id INT);\n"
		);

		const results = await Promise.all([
			runner.runAsync("up"),
			runner.runAsync("up"),
		]);
		expect(results.map((result) => result.code)).toEqual([0, 0]);
		expect(
			results.filter((result) =>
				result.output.includes("All migrations already applied.")
			)
		).toHaveLength(1);
		await expect(appliedIds()).resolves.toEqual(["001_fixture"]);
	});

	it("should roll back statement by statement and clear the journal", async () => {
		writeMigration(
			"001_fixture.up.sql",
			"CREATE TABLE fx_a (id INT);\nCREATE TABLE fx_b (id INT);\n"
		);
		writeMigration(
			"001_fixture.down.sql",
			"DROP TABLE fx_b;\nDROP TABLE fx_a;\n"
		);
		runner.run("up");
		runner.run("down");

		await expect(appliedIds()).resolves.toEqual([]);
		await expect(steps()).resolves.toEqual([]);
		await expect(
			rows(
				"SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'fx\\_%' AND table_schema = DATABASE()"
			)
		).resolves.toEqual([]);
	});
});
