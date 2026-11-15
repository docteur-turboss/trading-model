import { execFile, execFileSync } from "node:child_process";
import {
	copyFileSync,
	cpSync,
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	symlinkSync,
	unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const MIGRATE_SCRIPT = join(__dirname, "../../../../scripts/migrate.mjs");

/** Result of one migrate.mjs run. */
interface MigrateResult {
	readonly code: number;
	readonly output: string;
}

/** The real scripts/migrate.mjs, laid out with a given migrations directory. */
export interface MigrateRunner {
	/** Directory holding `migrations/`: tests may add or edit files there. */
	readonly migrationsDir: string;
	/** Runs migrate.mjs, throws on a non-zero exit. */
	run(...args: string[]): void;
	/** Runs migrate.mjs, resolves with its exit code and output (stdout + stderr). */
	runAsync(...args: string[]): Promise<MigrateResult>;
	cleanup(): void;
}

/**
 * Laid out like the K8s migration jobs (migrate.mjs next to `migrations/`, in a
 * directory of its own), with this workspace's mysql2: scripts/ has no
 * node_modules under the isolated linker. DB_* come from db-env.setup.
 * Without a source directory, `migrations/` starts empty.
 */
export function createMigrateRunner(
	sourceMigrationsDir?: string
): MigrateRunner {
	const dir = mkdtempSync(join(tmpdir(), "migrate-run-"));
	const migrationsDir = join(dir, "migrations");
	copyFileSync(MIGRATE_SCRIPT, join(dir, "migrate.mjs"));
	if (sourceMigrationsDir) {
		cpSync(sourceMigrationsDir, migrationsDir, { recursive: true });
	} else {
		mkdirSync(migrationsDir);
	}
	mkdirSync(join(dir, "node_modules"));
	// Real path: bun's workspace links are relative and break once re-linked elsewhere.
	symlinkSync(
		realpathSync(dirname(require.resolve("mysql2/package.json"))),
		join(dir, "node_modules/mysql2"),
		"junction"
	);
	const argv = (args: string[]) => [join(dir, "migrate.mjs"), ...args];
	return {
		migrationsDir,
		run: (...args) => {
			execFileSync(process.execPath, argv(args), {
				env: process.env,
				stdio: "pipe",
			});
		},
		runAsync: (...args) =>
			promisify(execFile)(process.execPath, argv(args), {
				env: process.env,
			}).then(
				({ stdout, stderr }) => ({ code: 0, output: stdout + stderr }),
				(err: { code?: number; stdout?: string; stderr?: string }) => ({
					code: err.code ?? 1,
					output: `${err.stdout ?? ""}${err.stderr ?? ""}`,
				})
			),
		cleanup: () => {
			unlinkSync(join(dir, "node_modules/mysql2"));
			rmSync(dir, { recursive: true, force: true });
		},
	};
}
