import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
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

// The start script of the K8s Redis HA StatefulSets, run here on a Docker
// network where each container plays a pod: same hostnames, same DNS names.
const HA_SCRIPT = join(__dirname, "../../../../deploy/k8s/infra/redis-ha.sh");
const ORDINALS = [0, 1, 2];
const REDIS_PORT = 6379;
const SENTINEL_PORT = 26379;
const FAILOVER_DEADLINE_MS = 20_000;
const HA_ENV = {
	REDIS_HOSTS: ORDINALS.map((n) => `redis-${n}`).join(" "),
	SENTINEL_HOSTS: ORDINALS.map((n) => `redis-sentinel-${n}`).join(" "),
	DOWN_AFTER_MS: "1000",
	FAILOVER_TIMEOUT_MS: "5000",
	SENTINEL_CONF: "/tmp/sentinel.conf",
};

function startPod(
	network: StartedNetwork,
	name: string,
	role: "server" | "sentinel",
	port: number,
	readyLog: string
): Promise<StartedTestContainer> {
	const args = role === "server" ? ["--appendonly", "no"] : [];
	return new GenericContainer(composeImage("redis"))
		.withNetwork(network)
		.withHostname(name)
		.withNetworkAliases(name)
		.withExposedPorts(port)
		.withEnvironment(HA_ENV)
		.withCopyFilesToContainer([
			{ source: HA_SCRIPT, target: "/scripts/redis-ha.sh" },
		])
		.withCommand(["sh", "/scripts/redis-ha.sh", role, ...args])
		.withWaitStrategy(Wait.forLogMessage(readyLog))
		.withStartupTimeout(120_000)
		.start();
}

const startRedis = (network: StartedNetwork, n: number) =>
	startPod(
		network,
		`redis-${n}`,
		"server",
		REDIS_PORT,
		"Ready to accept connections"
	);
const startSentinel = (network: StartedNetwork, n: number) =>
	startPod(
		network,
		`redis-sentinel-${n}`,
		"sentinel",
		SENTINEL_PORT,
		"+monitor master"
	);

async function cli(
	node: StartedTestContainer,
	...args: string[]
): Promise<string[]> {
	const { output } = await node.exec(["redis-cli", "--raw", ...args]);
	return output.trim().split("\n");
}

const role = async (node: StartedTestContainer) => (await cli(node, "ROLE"))[0];

async function sentinelField(
	sentinel: StartedTestContainer,
	field: string
): Promise<string> {
	const fields = await cli(
		sentinel,
		"-p",
		String(SENTINEL_PORT),
		"SENTINEL",
		"master",
		"mymaster"
	);
	return fields[fields.indexOf(field) + 1];
}

async function eventually(
	check: () => Promise<boolean>,
	timeoutMs = 60_000
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!(await check())) {
		if (Date.now() > deadline) {
			throw new Error("condition not met in time");
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
}

// The scenario runs in order: each step starts from the previous one's topology.
describe("K8s Redis HA start script — real failovers", () => {
	let network: StartedNetwork;
	const redis: StartedTestContainer[] = [];
	const sentinels: StartedTestContainer[] = [];
	const extras: StartedTestContainer[] = [];
	// Sentinels hand out network addresses; the client reaches each node
	// through its mapped port instead.
	const natMap: Record<string, { host: string; port: number }> = {};
	let manager: ConnectionManager<Redis>;
	let client: Redis;

	const ipOf = (node: StartedTestContainer) =>
		node.getIpAddress(network.getName());
	const mapNode = (node: StartedTestContainer) => {
		natMap[`${ipOf(node)}:${REDIS_PORT}`] = {
			host: node.getHost(),
			port: node.getMappedPort(REDIS_PORT),
		};
	};
	const masterIp = () => sentinelField(sentinels[0], "ip");
	const masterNode = async () => {
		const ip = await masterIp();
		return redis.find((node) => ipOf(node) === ip) as StartedTestContainer;
	};

	beforeAll(async () => {
		network = await new Network().start();
		// Both StatefulSets start together, as on a fresh cluster.
		const [nodes, watchers] = await Promise.all([
			Promise.all(ORDINALS.map((n) => startRedis(network, n))),
			Promise.all(ORDINALS.map((n) => startSentinel(network, n))),
		]);
		redis.push(...nodes);
		sentinels.push(...watchers);
		await eventually(async () => (await masterNode()) !== undefined);

		redis.forEach(mapNode);
		const connection = redisConnectionFromEnv({
			REDIS_SENTINELS: sentinels
				.map((s) => `localhost:${s.getMappedPort(SENTINEL_PORT)}`)
				.join(","),
		}) as RedisConnectionConfig;
		manager = createRedisConnectionManager(connection, {
			natMap,
		}) as ConnectionManager<Redis>;
		client = await manager.getConnection();
	}, 240_000);

	afterAll(async () => {
		await Promise.all(
			[...sentinels, ...redis, ...extras].map((node) =>
				node.stop().catch(() => {})
			)
		);
		await manager?.close();
		await network?.stop();
	}, 120_000);

	it("should bootstrap redis-0 as master, two replicas and three sentinels that know them all", async () => {
		expect(await masterIp()).toBe(ipOf(redis[0]));
		await eventually(async () => (await role(redis[1])) === "slave");
		await eventually(async () => (await role(redis[2])) === "slave");
		// Sentinels learn of replicas from the master's INFO, every 10s: until
		// then a failover finds no replica to promote.
		for (const sentinel of sentinels) {
			await eventually(
				async () =>
					(await sentinelField(sentinel, "num-other-sentinels")) === "2" &&
					(await sentinelField(sentinel, "num-slaves")) === "2"
			);
		}

		await client.set("before-failover", "1");
		await expect(client.call("WAIT", "2", "5000")).resolves.toBe(2);
	});

	it("should fail over when the master pod is deleted, then rejoin it as a replica", async () => {
		await redis[0].stop();

		const started = Date.now();
		await expect(client.set("after-failover", "1")).resolves.toBe("OK");
		expect(Date.now() - started).toBeLessThan(FAILOVER_DEADLINE_MS);
		await expect(client.get("before-failover")).resolves.toBe("1");

		redis[0] = await startRedis(network, 0);
		mapNode(redis[0]);
		await eventually(async () => (await role(redis[0])) === "slave");
		await eventually(
			async () => (await cli(redis[0], "GET", "after-failover"))[0] === "1"
		);
	});

	it("should not keep a ghost of a recreated sentinel, and still fail over", async () => {
		const oldIp = ipOf(sentinels[1]);
		await sentinels[1].stop();
		// Takes the freed address, so the new pod comes back with another IP.
		extras.push(
			await new GenericContainer(composeImage("redis"))
				.withNetwork(network)
				.withCommand(["sleep", "300"])
				.start()
		);
		sentinels[1] = await startSentinel(network, 1);
		expect(ipOf(sentinels[1])).not.toBe(oldIp);
		await eventually(async () =>
			(
				await cli(
					sentinels[0],
					"-p",
					String(SENTINEL_PORT),
					"SENTINEL",
					"sentinels",
					"mymaster"
				)
			).includes(ipOf(sentinels[1]))
		);

		for (const sentinel of sentinels) {
			await expect(
				sentinelField(sentinel, "num-other-sentinels")
			).resolves.toBe("2");
		}

		const master = await masterNode();
		await master.stop();
		// No deadline here: under load a first attempt can still abort for
		// lack of fresh replica INFO, and Sentinel retries after 2x the timeout.
		await expect(client.set("second-failover", "1")).resolves.toBe("OK");
		// The other sentinels learn of the switch from the one that failed over.
		await eventually(async () => (await masterIp()) !== ipOf(master));
	}, 120_000);
});
