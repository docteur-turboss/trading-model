import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import Redis from "ioredis";
import {
	GenericContainer,
	type StartedTestContainer,
	Wait,
} from "testcontainers";
import { buildFromConfig } from "../../src/redis-client-factories";
import { redisConnectionFromEnv } from "../../src/redis-env";

const { composeImage } = require("../../../../scripts/compose-image.cjs") as {
	composeImage: (service: string) => string;
};

// redis-ha.sh with REDIS_TLS_MODE (issue #930, ADR-0047) on one pod: the
// optional step still listens in clear text, the required step does not.
const HA_SCRIPT = join(__dirname, "../../../../deploy/k8s/infra/redis-ha.sh");
const dir = mkdtempSync(join(tmpdir(), "redis-tls-spec-"));
const openssl = (...args: string[]) =>
	execFileSync("openssl", args, { cwd: dir, stdio: "pipe" });

function makeCertificates(): void {
	openssl(
		"req",
		"-x509",
		"-newkey",
		"rsa:2048",
		"-nodes",
		"-keyout",
		"ca.key",
		"-out",
		"ca.crt",
		"-subj",
		"/CN=spec-ca",
		"-days",
		"1"
	);
	openssl(
		"req",
		"-newkey",
		"rsa:2048",
		"-nodes",
		"-keyout",
		"tls.key",
		"-out",
		"tls.csr",
		"-subj",
		"/CN=redis"
	);
	writeFileSync(join(dir, "san.cnf"), "subjectAltName=DNS:redis\n");
	openssl(
		"x509",
		"-req",
		"-in",
		"tls.csr",
		"-CA",
		"ca.crt",
		"-CAkey",
		"ca.key",
		"-CAcreateserial",
		"-out",
		"tls.crt",
		"-days",
		"1",
		"-extfile",
		"san.cnf"
	);
}

const startPod = (mode: "optional" | "required") =>
	new GenericContainer(composeImage("redis"))
		.withHostname("redis-0")
		.withExposedPorts(6379, 6380)
		.withEnvironment({
			REDIS_TLS_MODE: mode,
			REDIS_HOSTS: "",
			SENTINEL_HOSTS: "",
		})
		.withCopyFilesToContainer([
			{ source: HA_SCRIPT, target: "/scripts/redis-ha.sh" },
			...["tls.crt", "tls.key", "ca.crt"].map((f) => ({
				source: join(dir, f),
				target: `/etc/redis-tls/${f}`,
				mode: 0o644,
			})),
		])
		.withCommand(["sh", "/scripts/redis-ha.sh", "server", "--appendonly", "no"])
		.withWaitStrategy(Wait.forLogMessage("Ready to accept connections"))
		.withStartupTimeout(60_000)
		.start();

const client = (node: StartedTestContainer, port: number, options: object) =>
	new Redis({
		host: node.getHost(),
		port: node.getMappedPort(port),
		lazyConnect: true,
		maxRetriesPerRequest: 0,
		retryStrategy: () => null,
		...options,
	});
const tls = (servername: string) => ({
	tls: { ca: readFileSync(join(dir, "ca.crt")), servername },
});

describe("redis-ha.sh REDIS_TLS_MODE", () => {
	let optional: StartedTestContainer;
	let required: StartedTestContainer;

	beforeAll(async () => {
		makeCertificates();
		[optional, required] = await Promise.all([
			startPod("optional"),
			startPod("required"),
		]);
	}, 120_000);

	afterAll(async () => {
		await Promise.all([optional?.stop(), required?.stop()]);
	});

	it("should accept clear text and TLS in optional mode", async () => {
		const plain = client(optional, 6379, {});
		const secure = client(optional, 6380, tls("redis"));
		await expect(plain.ping()).resolves.toBe("PONG");
		await expect(secure.ping()).resolves.toBe("PONG");
		plain.disconnect();
		secure.disconnect();
	});

	it("should verify the server name in TLS", async () => {
		const wrong = client(optional, 6380, tls("other-host"));
		await expect(wrong.ping()).rejects.toThrow();
		wrong.disconnect();
	});

	it("should refuse clear text in required mode and serve the factory over TLS", async () => {
		const plain = client(required, 6379, {});
		await expect(plain.ping()).rejects.toThrow();
		plain.disconnect();

		const connection = redisConnectionFromEnv({
			REDIS_URL: `redis://${required.getHost()}:${required.getMappedPort(6380)}`,
			REDIS_TLS_MODE: "required",
			REDIS_TLS_CA: join(dir, "ca.crt"),
		});
		if (!connection) {
			throw new Error("no connection");
		}
		const secure = buildFromConfig(connection, { lazyConnect: true });
		await expect(secure.ping()).resolves.toBe("PONG");
		secure.disconnect();
	});
});
