import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "@jest/globals";
import { MongoClient } from "mongodb";
import {
	GenericContainer,
	type StartedTestContainer,
	Wait,
} from "testcontainers";
import { buildAuditDocument } from "../../src/adapters/outbound/persistence/audit-document-builder";
import { AuditRepository } from "../../src/adapters/outbound/persistence/audit-repository";
import { serviceEnv } from "./chain-cli-env";

/**
 * chain-cli wired as in production (real MongoDB, real S3Client against an S3
 * API). The store is `rclone serve s3` from the backup-tools image, the one
 * the repo already uses as a local S3. It does not implement Object Lock: the
 * headers are accepted and ignored, so immutability itself is not proven here.
 */
// Loaded after SERVICE_ENV is set: their ENV schema validates at import.
let serviceVars: Record<string, string>;
let runChainCli: typeof import("../../src/application/chain-cli.js").runChainCli;
let createChainAudit: typeof import("../../src/config/container.js").createChainAudit;
let createRepositories: typeof import("../../src/config/container.js").createRepositories;

const ROOT = join(__dirname, "..", "..", "..", "..");
const SERVICE = join(__dirname, "..", "..");
const ACCESS_KEY = "cli-test";
const SECRET_KEY = "cli-test-secret-key";
const USAGE_START = "Audit chain tools (ADR-0027)";

function envelope(i: number) {
	return {
		payload: { symbol: "BTCUSDT", price: 65000.5 + i, volume: i },
		metadata: {
			topic: "market.data",
			messageId: `msg-${i}`,
			emittedAt: new Date(Date.UTC(2026, 10, 1, 12, 0, i)).toISOString(),
			publisher: { serviceName: "financial-scraper", instanceId: "fs-1" },
		},
	} as never;
}

describe("chain-cli against a real MongoDB and an S3 anchor store", () => {
	let mongo: MongoClient;
	let s3Container: StartedTestContainer;
	let endpoint: string;
	let dbName: string;
	let bucketSeq = 0;
	let bucket: string;
	const settings = () => ({
		retentionDays: 1827,
		anchorBucket: bucket,
		anchorPrefix: "audit-chain/",
		anchorRegion: "us-east-1",
		anchorEndpoint: endpoint,
		anchorRequired: true,
	});

	beforeAll(async () => {
		serviceVars = serviceEnv();
		Object.assign(process.env, serviceVars);
		({ runChainCli } = await import("../../src/application/chain-cli.js"));
		({ createChainAudit, createRepositories } = await import(
			"../../src/config/container.js"
		));
		process.env.AWS_ACCESS_KEY_ID = ACCESS_KEY;
		process.env.AWS_SECRET_ACCESS_KEY = SECRET_KEY;
		mongo = await MongoClient.connect(process.env.TEST_MONGO_URI as string);
		const image = await GenericContainer.fromDockerfile(
			join(ROOT, "deploy", "backup")
		).build("trading-model-chain-cli-s3:test");
		s3Container = await image
			.withEntrypoint(["sh", "-c"])
			.withCommand([
				`mkdir -p /tmp/s3 && exec rclone serve s3 --addr :9000 --auth-key ${ACCESS_KEY},${SECRET_KEY} /tmp/s3`,
			])
			.withExposedPorts(9000)
			.withWaitStrategy(Wait.forListeningPorts())
			.start();
		endpoint = `http://${s3Container.getHost()}:${s3Container.getMappedPort(9000)}`;
	}, 600_000);

	beforeEach(async () => {
		dbName = `chain-cli-${Date.now()}`;
		bucket = `anchors-${++bucketSeq}`;
		await new S3Client({
			region: "us-east-1",
			endpoint,
			forcePathStyle: true,
		}).send(new CreateBucketCommand({ Bucket: bucket }));
	});

	afterAll(async () => {
		await mongo?.close();
		await s3Container?.stop();
	});

	/** Same `open()` as the entry point, on the test database. */
	async function cli(args: string[]) {
		const out: string[] = [];
		const err: string[] = [];
		const uri = `${process.env.TEST_MONGO_URI}`.replace(
			/\/(\?|$)/,
			`/${dbName}$1`
		);
		const code = await runChainCli(args, {
			open: async () => {
				const { mongoManager, db } = await createRepositories(uri);
				return {
					audit: createChainAudit(db, settings()),
					close: () => mongoManager.close(),
				};
			},
			out: (text) => out.push(text),
			err: (text) => err.push(text),
		});
		return { code, out: out.join("\n"), err: err.join("\n") };
	}

	async function writeChainAndAnchor(count: number) {
		const db = mongo.db(dbName);
		const repository = new AuditRepository(db);
		await repository.ensureIndexes();
		for (let i = 1; i <= count; i++) {
			await repository.insert(buildAuditDocument(envelope(i), 30));
		}
		const { mongoManager, db: wired } = await createRepositories(
			`${process.env.TEST_MONGO_URI}`.replace(/\/(\?|$)/, `/${dbName}$1`)
		);
		try {
			await createChainAudit(wired, settings()).runCycle();
		} finally {
			await mongoManager.close();
		}
		return db;
	}

	it("reports a healthy chain, flags a restore, then lists the acknowledged loss", async () => {
		const db = await writeChainAndAnchor(5);

		const healthy = await cli(["report"]);
		expect(healthy.code).toBe(0);
		expect(JSON.parse(healthy.out)).toMatchObject({
			verification: { broken: null },
			anchors: { count: 1, last: { chainSequence: 5 } },
			acknowledgements: [],
		});

		// A restore from an older backup: events from sequence 4 on are gone.
		await db
			.collection("audit_events")
			.deleteMany({ chainSequence: { $gte: 4 } });
		const broken = await cli(["report"]);
		expect(broken.code).toBe(1);
		expect(JSON.parse(broken.out).verification.broken).not.toBeNull();

		const ack = await cli(["acknowledge-loss", "4", "restore", "drill"]);
		expect(ack).toMatchObject({
			code: 0,
			out: "Loss acknowledged from sequence 4",
		});

		const after = await cli(["report"]);
		expect(after.code).toBe(0);
		const report = JSON.parse(after.out);
		expect(report.verification.broken).toBeNull();
		expect(report.acknowledgements).toEqual([
			expect.objectContaining({
				fromSequence: 4,
				reason: "restore drill",
				acknowledgedAt: expect.any(String),
			}),
		]);
	});

	it.each([
		[["acknowledge-loss", "0", "x"]],
		[["acknowledge-loss", "abc", "x"]],
		[["acknowledge-loss", "3"]],
		[["unknown"]],
	])("refuses %j with the usage and writes nothing", async (args) => {
		await writeChainAndAnchor(2);
		const result = await cli(args);
		expect(result.code).toBe(2);
		expect(result.err).toContain(USAGE_START);
		expect(JSON.parse((await cli(["report"])).out).acknowledgements).toEqual(
			[]
		);
	});

	describe("real entry point as a child process", () => {
		const run = promisify(execFile);
		beforeAll(async () => {
			await run("bun", ["run", "build"], { cwd: SERVICE, shell: true });
		}, 300_000);

		function spawnCli(args: string[]) {
			return run("node", ["dist/application/chain-cli.js", ...args], {
				cwd: SERVICE,
				env: {
					...process.env,
					...serviceVars,
					NODE_ENV: "test",
					MONGODB_URI: `${process.env.TEST_MONGO_URI}`.replace(
						/\/(\?|$)/,
						`/${dbName}$1`
					),
					AUDIT_ANCHOR_BUCKET: bucket,
					AUDIT_ANCHOR_ENDPOINT: endpoint,
					AUDIT_ANCHOR_REQUIRED: "true",
				},
			}).then(
				({ stdout, stderr }) => ({ code: 0, stdout, stderr }),
				(e: { code: number; stdout: string; stderr: string }) => e
			);
		}

		it("exits 0, 1 and 2 like the runbook expects", async () => {
			const db = await writeChainAndAnchor(3);
			expect((await spawnCli(["report"])).code).toBe(0);

			await db
				.collection("audit_events")
				.deleteMany({ chainSequence: { $gte: 2 } });
			expect((await spawnCli(["report"])).code).toBe(1);

			const ack = await spawnCli(["acknowledge-loss", "2", "child process"]);
			expect(ack.code).toBe(0);
			expect(ack.stdout).toContain("Loss acknowledged from sequence 2");
			expect((await spawnCli(["report"])).code).toBe(0);

			const bad = await spawnCli(["acknowledge-loss"]);
			expect(bad.code).toBe(2);
			expect(bad.stderr).toContain(USAGE_START);
		}, 120_000);
	});
});
