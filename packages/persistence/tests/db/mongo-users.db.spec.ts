import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { MongoClient } from "mongodb";
import {
	GenericContainer,
	type StartedTestContainer,
	Wait,
} from "testcontainers";

const { composeImage } = require("../../../../scripts/compose-image.cjs") as {
	composeImage: (service: string) => string;
};

// deploy/mongo/users.js (ADR-0058) run against a mongod with authentication
// on, as the compose service `mongo-users` and the K8s Jobs run it.
const USERS_SCRIPT = join(__dirname, "../../../../deploy/mongo/users.js");
const PASSWORDS = {
	root: "root-pw",
	exporter: "exporter-pw",
	backup: "backup-pw",
	"audit-logger": "audit-pw",
	"dlq-service": "dlq-pw",
};
const SCRIPT_ENV = [
	"MONGO_ROOT_PASSWORD=root-pw",
	"MONGO_EXPORTER_PASSWORD=exporter-pw",
	"MONGO_BACKUP_PASSWORD=backup-pw",
	"MONGO_AUDIT_PASSWORD=audit-pw",
	"MONGO_AUDIT_DB=audit",
	"MONGO_DLQ_PASSWORD=dlq-pw",
	"MONGO_DLQ_DB=dlq",
];

let container: StartedTestContainer;
let host: string;

async function runUsersScript(): Promise<void> {
	const result = await container.exec([
		"env",
		...SCRIPT_ENV,
		"mongosh",
		"--quiet",
		"admin",
		"--file",
		"/scripts/users.js",
	]);
	expect({ code: result.exitCode, out: result.output }).toMatchObject({
		code: 0,
	});
}

async function client(user: keyof typeof PASSWORDS): Promise<MongoClient> {
	return new MongoClient(`mongodb://${host}/?authSource=admin`, {
		auth: { username: user, password: PASSWORDS[user] },
		directConnection: true,
	}).connect();
}

/** Runs `action` as `user` and returns the MongoDB error code, or 0. */
async function codeOf(
	user: keyof typeof PASSWORDS,
	action: (c: MongoClient) => Promise<unknown>
): Promise<number> {
	const c = await client(user);
	try {
		await action(c);
		return 0;
	} catch (error) {
		return (error as { code?: number }).code ?? -1;
	} finally {
		await c.close();
	}
}

const UNAUTHORIZED = 13;

describe("MongoDB users (deploy/mongo/users.js)", () => {
	beforeAll(async () => {
		container = await new GenericContainer(composeImage("mongo"))
			.withCommand(["mongod", "--auth"])
			.withEnvironment({
				MONGO_INITDB_ROOT_USERNAME: "root",
				MONGO_INITDB_ROOT_PASSWORD: PASSWORDS.root,
			})
			.withCopyFilesToContainer([
				{ source: USERS_SCRIPT, target: "/scripts/users.js" },
			])
			.withExposedPorts(27017)
			.withWaitStrategy(Wait.forLogMessage(/Waiting for connections/, 2))
			.start();
		host = `${container.getHost()}:${container.getMappedPort(27017)}`;
		await runUsersScript();
	}, 120_000);

	afterAll(async () => {
		await container?.stop();
	});

	it("refuses a client without credentials", async () => {
		const anonymous = await new MongoClient(`mongodb://${host}`, {
			directConnection: true,
		}).connect();
		await expect(
			anonymous.db("audit").collection("audit_events").findOne({})
		).rejects.toMatchObject({ code: UNAUTHORIZED });
		await anonymous.close();
	});

	it("gives audit-logger its database and nothing else", async () => {
		expect(
			await codeOf("audit-logger", (c) =>
				c.db("audit").collection("audit_events").insertOne({ a: 1 })
			)
		).toBe(0);
		expect(
			await codeOf("audit-logger", (c) =>
				c.db("dlq").collection("dlq_entries").findOne({})
			)
		).toBe(UNAUTHORIZED);
	});

	it("gives dlq-service its database and nothing else", async () => {
		expect(
			await codeOf("dlq-service", (c) =>
				c.db("dlq").collection("dlq_entries").insertOne({ a: 1 })
			)
		).toBe(0);
		expect(
			await codeOf("dlq-service", (c) =>
				c.db("audit").collection("audit_events").insertOne({ a: 2 })
			)
		).toBe(UNAUTHORIZED);
	});

	it("lets the exporter monitor but neither read nor write data", async () => {
		expect(
			await codeOf("exporter", (c) =>
				c.db("admin").command({ serverStatus: 1 })
			)
		).toBe(0);
		expect(
			await codeOf("exporter", (c) =>
				c.db("audit").collection("audit_events").findOne({})
			)
		).toBe(UNAUTHORIZED);
	});

	it("lets backup read every database but write none", async () => {
		expect(
			await codeOf("backup", (c) =>
				c.db("audit").collection("audit_events").findOne({})
			)
		).toBe(0);
		expect(
			await codeOf("backup", (c) =>
				c.db("audit").collection("audit_events").insertOne({ a: 3 })
			)
		).toBe(UNAUTHORIZED);
	});

	it("applies a rotated password when it runs again", async () => {
		await runUsersScript();
		expect(
			await codeOf("dlq-service", (c) => c.db("dlq").command({ ping: 1 }))
		).toBe(0);
	});
});
