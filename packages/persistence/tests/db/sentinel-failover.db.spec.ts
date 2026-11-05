import { afterEach, describe, expect, it, jest } from "@jest/globals";
import type Redis from "ioredis";
import {
	GenericContainer,
	Network,
	type StartedNetwork,
	type StartedTestContainer,
	Wait,
} from "testcontainers";
import type { ConnectionManager } from "../../src/connection-manager";
import type { RedisConnectionConfig } from "../../src/redis-config";
import { createRedisConnectionManager } from "../../src/redis-connection-manager";
import { redisConnectionFromEnv } from "../../src/redis-env";

const { composeImage } = require("../../../../scripts/compose-image.cjs") as {
	composeImage: (service: string) => string;
};

const MASTER_NAME = "mymaster";
const REDIS_PORT = 6379;
const SENTINEL_PORT = 26379;
// Sentinel fails over in ~2s here; the old master stays frozen for 60s.
const FREEZE_SECONDS = 60;
// down-after (1 s) + promotion (~2 s) + client backoff (200 ms × attempt) stay
// under ~5 s locally; the deadline leaves a 4× margin for a slow CI runner.
const FAILOVER_DEADLINE_MS = 20_000;

interface Topology {
	network: StartedNetwork;
	master: StartedTestContainer;
	replica: StartedTestContainer;
	sentinel: StartedTestContainer;
	manager: ConnectionManager<Redis>;
}

function startRedis(
	network: StartedNetwork,
	args: string[] = [],
	readyLog = "Ready to accept connections"
) {
	return new GenericContainer(composeImage("redis"))
		.withNetwork(network)
		.withExposedPorts(REDIS_PORT)
		.withCommand([
			"redis-server",
			"--appendonly",
			"no",
			"--enable-debug-command",
			"yes",
			...args,
		])
		.withWaitStrategy(Wait.forLogMessage(readyLog))
		.start();
}

// Sentinel monitors by IP: with `resolve-hostnames`, a dead master's name stops
// resolving and Sentinel stalls in TILT mode instead of failing over.
function startSentinel(network: StartedNetwork, masterIp: string) {
	const conf = [
		`port ${SENTINEL_PORT}`,
		`sentinel monitor ${MASTER_NAME} ${masterIp} ${REDIS_PORT} 1`,
		`sentinel down-after-milliseconds ${MASTER_NAME} 1000`,
		`sentinel failover-timeout ${MASTER_NAME} 5000`,
	].join("\\n");
	return new GenericContainer(composeImage("redis"))
		.withNetwork(network)
		.withExposedPorts(SENTINEL_PORT)
		.withCommand([
			"sh",
			"-c",
			`printf '${conf}\\n' > /tmp/sentinel.conf && exec redis-server /tmp/sentinel.conf --sentinel`,
		])
		.withWaitStrategy(Wait.forLogMessage("+slave slave"))
		.start();
}

/** One master, one replica and one sentinel, reached through a sentinel-mode manager. */
async function startTopology(): Promise<Topology> {
	const network = await new Network().start();
	const master = await startRedis(network);
	const masterIp = master.getIpAddress(network.getName());
	const replica = await startRedis(
		network,
		["--replicaof", masterIp, String(REDIS_PORT)],
		"sync: Finished with success"
	);
	const sentinel = await startSentinel(network, masterIp);

	// Sentinel hands out network addresses; the client reaches each node
	// through its mapped port instead.
	const natMap = Object.fromEntries(
		[master, replica].map((node) => [
			`${node.getIpAddress(network.getName())}:${REDIS_PORT}`,
			{ host: node.getHost(), port: node.getMappedPort(REDIS_PORT) },
		])
	);
	// Configured the way services are: the sentinel is reached by DNS name.
	const connection = redisConnectionFromEnv({
		REDIS_SENTINELS: `localhost:${sentinel.getMappedPort(SENTINEL_PORT)}`,
		REDIS_SENTINEL_MASTER_NAME: MASTER_NAME,
	}) as RedisConnectionConfig;
	const manager = createRedisConnectionManager(connection, {
		natMap,
	}) as ConnectionManager<Redis>;
	return { network, master, replica, sentinel, manager };
}

/** Resolves once the sentinel names the replica as the master. */
async function waitForPromotion({ sentinel, replica, network }: Topology) {
	const replicaIp = replica.getIpAddress(network.getName());
	for (;;) {
		const { output } = await sentinel.exec([
			"redis-cli",
			"-p",
			String(SENTINEL_PORT),
			"SENTINEL",
			"get-master-addr-by-name",
			MASTER_NAME,
		]);
		if (
			output.startsWith(`${replicaIp}
`)
		) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 200));
	}
}

/** ioredis internals the reconnect race test drives (not part of its API). */
interface SentinelInternals {
	resolve(endpoint: unknown): Promise<unknown>;
	failoverDetector?: { isDisconnected: boolean } | null;
}

async function waitUntil(condition: () => boolean | undefined): Promise<void> {
	while (!condition()) {
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
}

async function role(client: Redis): Promise<string> {
	const [current] = (await client.call("ROLE")) as [string];
	return current;
}

/** Writes through the client and waits until the replica has acknowledged it. */
async function writeReplicated(client: Redis): Promise<void> {
	await client.set("replicated", "1");
	await expect(client.call("WAIT", "1", "5000")).resolves.toBe(1);
}

async function expectServedByPromotedReplica(
	client: Redis,
	replica: StartedTestContainer
): Promise<void> {
	const started = Date.now();
	await expect(client.set("after-failover", "written")).resolves.toBe("OK");
	expect(Date.now() - started).toBeLessThan(FAILOVER_DEADLINE_MS);
	await expect(role(client)).resolves.toBe("master");
	await expect(client.get("replicated")).resolves.toBe("1");
	await expect(
		replica.exec(["redis-cli", "GET", "after-failover"])
	).resolves.toMatchObject({ output: "written\n" });
}

describe("createRedisConnectionManager (sentinel) — real failover", () => {
	let topology: Topology | undefined;

	afterEach(async () => {
		if (!topology) {
			return;
		}
		const { manager, sentinel, replica, master, network } = topology;
		topology = undefined;
		// Stop the nodes first: quitting would wait on a frozen master.
		await Promise.all(
			[sentinel, replica, master].map((node) => node.stop().catch(() => {}))
		);
		await manager.close();
		await network.stop();
	}, 60_000);

	it("should connect to the master the sentinel designates", async () => {
		topology = await startTopology();
		const client = await topology.manager.getConnection();

		await expect(client.set("key", "value")).resolves.toBe("OK");
		await expect(role(client)).resolves.toBe("master");
	}, 120_000);

	it("should follow the promoted replica when the master dies, without losing replicated writes", async () => {
		topology = await startTopology();
		const client = await topology.manager.getConnection();
		await writeReplicated(client);

		await topology.master.stop();

		await expectServedByPromotedReplica(client, topology.replica);
	}, 120_000);

	// Deterministic form of the CI flake (#451): the first reconnect asks the
	// sentinel before the promotion and only returns once the detector of the
	// closed connection has seen +switch-master, the window ioredis lost.
	it("should survive a failover announced while it reconnects", async () => {
		topology = await startTopology();
		const client = await topology.manager.getConnection();
		await writeReplicated(client);
		const connector = (client as unknown as { connector: SentinelInternals })
			.connector;
		const resolve = connector.resolve.bind(connector);
		const current = topology;
		jest
			.spyOn(connector, "resolve")
			.mockImplementationOnce(async (endpoint) => {
				const address = await resolve(endpoint);
				await waitForPromotion(current);
				await waitUntil(() => connector.failoverDetector?.isDisconnected);
				return address;
			});

		await topology.master.stop();

		await expectServedByPromotedReplica(client, topology.replica);
	}, 120_000);

	it("should leave a frozen master for the promoted replica", async () => {
		topology = await startTopology();
		const client = await topology.manager.getConnection();
		await writeReplicated(client);

		// The master stops answering but keeps its connections open.
		void topology.master.exec([
			"redis-cli",
			"DEBUG",
			"SLEEP",
			String(FREEZE_SECONDS),
		]);
		await waitForPromotion(topology);

		await expectServedByPromotedReplica(client, topology.replica);
	}, 120_000);
});
