import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
} from "@jest/globals";
import { DlqRedisQueue } from "../../src/config/redis-queue";

const QUEUE_KEY = "dlq:queue:db-spec";

let queues: DlqRedisQueue[] = [];

async function connectedQueue(): Promise<DlqRedisQueue> {
	const queue = new DlqRedisQueue(QUEUE_KEY);
	await expect(queue.connect()).resolves.toBe(true);
	queues.push(queue);
	return queue;
}

async function drain(queue: DlqRedisQueue): Promise<string[]> {
	const popped: string[] = [];
	for (let id = await queue.pop(); id !== null; id = await queue.pop()) {
		popped.push(id);
	}
	return popped;
}

beforeEach(async () => {
	await drain(await connectedQueue());
});

afterEach(async () => {
	await Promise.all(queues.map((queue) => queue.close()));
	queues = [];
});

afterAll(async () => {
	await Promise.all(queues.map((queue) => queue.close()));
});

describe("DlqRedisQueue — real Redis", () => {
	it("should pop entries in the order they were pushed", async () => {
		const queue = await connectedQueue();

		for (const id of ["a", "b", "c"]) {
			await queue.push(id);
		}

		await expect(drain(queue)).resolves.toEqual(["a", "b", "c"]);
	});

	it("should hand each entry to exactly one of several competing workers", async () => {
		const producer = await connectedQueue();
		const ids = Array.from({ length: 200 }, (_, i) => `entry-${i}`);
		for (const id of ids) {
			await producer.push(id);
		}
		const workers = await Promise.all(
			Array.from({ length: 4 }, () => connectedQueue())
		);

		const popped = (await Promise.all(workers.map(drain))).flat();

		expect(popped).toHaveLength(ids.length);
		expect(new Set(popped)).toEqual(new Set(ids));
	});

	it("should never grow past its size limit under concurrent pushes", async () => {
		const queues = await Promise.all(
			Array.from({ length: 4 }, () => connectedQueue())
		);

		const accepted = await Promise.all(
			Array.from({ length: 100 }, (_, i) =>
				queues[i % queues.length].push(`entry-${i}`, 10)
			)
		);

		expect(accepted.filter(Boolean)).toHaveLength(10);
		await expect(drain(queues[0])).resolves.toHaveLength(10);
	});

	it("should refuse pushes once the limit is reached", async () => {
		const queue = await connectedQueue();
		await queue.push("a", 2);
		await queue.push("b", 2);

		await expect(queue.push("c", 2)).resolves.toBe(false);
		await expect(drain(queue)).resolves.toEqual(["a", "b"]);
	});
});
