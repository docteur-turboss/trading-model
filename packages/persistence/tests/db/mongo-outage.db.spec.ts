import {
	createConnection,
	createServer,
	type Server,
	type Socket,
} from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { MongoConnectionManager } from "../../src/mongo-connection-manager";

/** A TCP hop between the driver and MongoDB that can drop like a network partition. */
class Partition {
	private readonly _sockets = new Set<Socket>();
	private _open = true;
	readonly server: Server;

	constructor(target: { host: string; port: number }) {
		this.server = createServer((client) => {
			if (!this._open) {
				client.destroy();
				return;
			}
			const upstream = createConnection(target);
			for (const socket of [client, upstream]) {
				this._sockets.add(socket);
				socket.on("close", () => this._sockets.delete(socket));
				socket.on("error", () => socket.destroy());
			}
			client.pipe(upstream).pipe(client);
		});
	}

	cut(): void {
		this._open = false;
		for (const socket of this._sockets) {
			socket.destroy();
		}
	}

	heal(): void {
		this._open = true;
	}
}

async function until(
	condition: () => boolean,
	timeoutMs: number
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!condition()) {
		if (Date.now() > deadline) {
			throw new Error(`condition not met within ${timeoutMs} ms`);
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
}

describe("MongoConnectionManager — MongoDB unreachable", () => {
	const mongo = new URL(process.env.TEST_MONGO_URI as string);
	const partition = new Partition({
		host: mongo.hostname,
		port: Number(mongo.port),
	});
	let manager: MongoConnectionManager;

	beforeAll(async () => {
		partition.server.listen(0, "127.0.0.1");
		await new Promise((resolve) => partition.server.once("listening", resolve));
		const { port } = partition.server.address() as { port: number };
		mongo.host = `127.0.0.1:${port}`;
		manager = new MongoConnectionManager({
			uri: mongo.toString(),
			dbName: "persistence_outage_db_spec",
		});
	});

	afterAll(async () => {
		partition.heal();
		await manager.close();
		partition.cut();
		await new Promise((resolve) => partition.server.close(resolve));
	});

	it("should stop reporting a connection while MongoDB is unreachable, then report it again", async () => {
		const smoke = (await manager.getDb()).collection("smoke");
		await smoke.insertOne({ value: 1 });
		expect(manager.isConnected()).toBe(true);

		partition.cut();
		// dlq-service answers 503 STORAGE_UNAVAILABLE from this flag instead of
		// holding each write for the server selection timeout.
		await until(() => !manager.isConnected(), 5000);

		partition.heal();
		await until(() => manager.isConnected(), 20_000);
		await expect(smoke.countDocuments()).resolves.toBe(1);
	});
});
