import { beforeEach, describe, expect, it, jest } from "@jest/globals";

type EventHandler = (...args: unknown[]) => void;

interface FakeWorker {
	on: (event: string, handler: EventHandler) => void;
	postMessage: jest.Mock;
	terminate: jest.Mock;
	removeAllListeners: jest.Mock;
	_listeners: Map<string, EventHandler[]>;
}

const FAKE_WORKERS: FakeWorker[] = [];

jest.mock("node:worker_threads", () => {
	const FakeWorker = jest.fn().mockImplementation(() => {
		const listeners = new Map<string, EventHandler[]>();
		const worker: FakeWorker = {
			on: (event: string, handler: EventHandler) => {
				if (!listeners.has(event)) {
					listeners.set(event, []);
				}
				listeners.get(event)!.push(handler);
			},
			postMessage: jest.fn(),
			terminate: jest.fn(),
			removeAllListeners: jest.fn(),
			_listeners: listeners,
		};
		FAKE_WORKERS.push(worker);
		return worker;
	});
	return { Worker: FakeWorker };
});

jest.mock("node:os", () => ({
	availableParallelism: jest.fn(() => 2),
}));

import { WorkerPool } from "../src/worker-pool";

function triggerMessage(
	worker: FakeWorker,
	msg: { id: string; success: boolean; data?: unknown; error?: string }
): void {
	const handlers = worker._listeners.get("message") ?? [];
	for (const h of handlers) {
		h(msg);
	}
}

function triggerError(worker: FakeWorker): void {
	const handlers = worker._listeners.get("error") ?? [];
	for (const h of handlers) {
		h(new Error("worker error"));
	}
}

function triggerExit(worker: FakeWorker, code: number): void {
	const handlers = worker._listeners.get("exit") ?? [];
	for (const h of handlers) {
		h(code);
	}
}

describe("WorkerPool", () => {
	beforeEach(() => {
		FAKE_WORKERS.length = 0;
		jest.clearAllMocks();
	});

	it("should spawn workers lazily on first execute", () => {
		const pool = new WorkerPool({ size: 3, workerScript: "/fake/worker.js" });
		expect(pool.size).toBe(0);

		pool.execute("generateKeyPair", { algorithm: "ec" }).catch(() => {});
		expect(pool.size).toBe(3);
		expect(FAKE_WORKERS).toHaveLength(3);
		void pool.terminate();
	});

	it("should use availableParallelism when no size specified", () => {
		const pool = new WorkerPool({ workerScript: "/fake/worker.js" });
		expect(pool.size).toBe(0);

		pool.execute("generateKeyPair", { algorithm: "ec" }).catch(() => {});
		expect(pool.size).toBe(2);
		void pool.terminate();
	});

	it("should dispatch a task to an idle worker", () => {
		const pool = new WorkerPool({ size: 1, workerScript: "/fake/worker.js" });
		const promise = pool.execute("generateKeyPair", { algorithm: "ec" });

		expect(FAKE_WORKERS[0].postMessage).toHaveBeenCalledWith({
			id: expect.any(String),
			type: "generateKeyPair",
			data: { algorithm: "ec" },
		});

		promise.catch(() => {});
		void pool.terminate();
	});

	it("should resolve when worker sends success", async () => {
		const pool = new WorkerPool({ size: 1, workerScript: "/fake/worker.js" });
		const promise = pool.execute("generateKeyPair", { algorithm: "ec" });

		const call = FAKE_WORKERS[0].postMessage.mock.calls[0][0] as { id: string };
		triggerMessage(FAKE_WORKERS[0], {
			id: call.id,
			success: true,
			data: { publicKey: "pk", privateKey: "sk" },
		});

		const result = await promise;
		expect(result).toEqual({ publicKey: "pk", privateKey: "sk" });
		await pool.terminate();
	});

	it("should reject when worker sends error", async () => {
		const pool = new WorkerPool({ size: 1, workerScript: "/fake/worker.js" });
		const promise = pool.execute("generateKeyPair", { algorithm: "ec" });

		const call = FAKE_WORKERS[0].postMessage.mock.calls[0][0] as { id: string };
		triggerMessage(FAKE_WORKERS[0], {
			id: call.id,
			success: false,
			error: "keygen failed",
		});

		await expect(promise).rejects.toThrow("keygen failed");
		await pool.terminate();
	});

	it("should queue tasks when all workers are busy", () => {
		const pool = new WorkerPool({ size: 1, workerScript: "/fake/worker.js" });

		pool.execute("generateKeyPair", { algorithm: "ec" }).catch(() => {});
		pool.execute("signCertificate", { csr: "csr" }).catch(() => {});

		expect(pool.pending).toBe(1);
		expect(FAKE_WORKERS[0].postMessage).toHaveBeenCalledTimes(1);

		void pool.terminate();
	});

	it("should dispatch queued task when worker becomes idle", async () => {
		const pool = new WorkerPool({ size: 1, workerScript: "/fake/worker.js" });

		const p1 = pool.execute("generateKeyPair", { algorithm: "ec" });
		const p2 = pool.execute("signCertificate", { csr: "csr" }).catch(() => {});

		expect(pool.pending).toBe(1);

		const call1 = FAKE_WORKERS[0].postMessage.mock.calls[0][0] as {
			id: string;
		};
		triggerMessage(FAKE_WORKERS[0], {
			id: call1.id,
			success: true,
			data: { publicKey: "pk", privateKey: "sk" },
		});

		await p1;

		expect(FAKE_WORKERS[0].postMessage).toHaveBeenCalledTimes(2);
		expect(pool.pending).toBe(0);

		const call2 = FAKE_WORKERS[0].postMessage.mock.calls[1][0] as {
			id: string;
			type: string;
		};
		expect(call2.type).toBe("signCertificate");

		p2.catch(() => {});
		await pool.terminate();
	});

	it("should track active worker count", () => {
		const pool = new WorkerPool({ size: 2, workerScript: "/fake/worker.js" });

		expect(pool.active).toBe(0);

		pool.execute("generateKeyPair", { algorithm: "ec" }).catch(() => {});
		expect(pool.active).toBe(1);

		pool.execute("signCertificate", { csr: "csr" }).catch(() => {});
		expect(pool.active).toBe(2);

		void pool.terminate();
	});

	it("should reject tasks after termination", async () => {
		const pool = new WorkerPool({ size: 1, workerScript: "/fake/worker.js" });
		await pool.terminate();

		await expect(
			pool.execute("generateKeyPair", { algorithm: "ec" })
		).rejects.toThrow("terminated");
	});

	it("should replace worker on error", () => {
		const pool = new WorkerPool({ size: 1, workerScript: "/fake/worker.js" });
		pool.execute("generateKeyPair", { algorithm: "ec" }).catch(() => {});

		const initialCount = FAKE_WORKERS.length;
		triggerError(FAKE_WORKERS[0]);

		expect(FAKE_WORKERS.length).toBe(initialCount + 1);
		void pool.terminate();
	});

	it("should replace worker on non-zero exit", () => {
		const pool = new WorkerPool({ size: 1, workerScript: "/fake/worker.js" });
		pool.execute("generateKeyPair", { algorithm: "ec" }).catch(() => {});

		const initialCount = FAKE_WORKERS.length;
		triggerExit(FAKE_WORKERS[0], 1);

		expect(FAKE_WORKERS.length).toBe(initialCount + 1);
		void pool.terminate();
	});

	it("should not replace worker on zero exit", () => {
		const pool = new WorkerPool({ size: 1, workerScript: "/fake/worker.js" });
		pool.execute("generateKeyPair", { algorithm: "ec" }).catch(() => {});

		const initialCount = FAKE_WORKERS.length;
		triggerExit(FAKE_WORKERS[0], 0);

		expect(FAKE_WORKERS.length).toBe(initialCount);
		void pool.terminate();
	});

	it("should not replace worker when terminated", () => {
		const pool = new WorkerPool({ size: 1, workerScript: "/fake/worker.js" });
		pool.execute("generateKeyPair", { algorithm: "ec" }).catch(() => {});
		void pool.terminate();

		const initialCount = FAKE_WORKERS.length;
		triggerError(FAKE_WORKERS[0]);

		expect(FAKE_WORKERS.length).toBe(initialCount);
	});

	it("should not replace a worker that was already removed", () => {
		const pool = new WorkerPool({ size: 1, workerScript: "/fake/worker.js" });
		pool.execute("generateKeyPair", { algorithm: "ec" }).catch(() => {});

		const oldWorker = FAKE_WORKERS[0];
		triggerError(oldWorker);

		const countAfterFirstError = FAKE_WORKERS.length;
		triggerError(oldWorker);

		expect(FAKE_WORKERS.length).toBe(countAfterFirstError);
		void pool.terminate();
	});

	it("should start workers via start() method", () => {
		const pool = new WorkerPool({ size: 2, workerScript: "/fake/worker.js" });
		expect(pool.size).toBe(0);

		pool.start();

		expect(pool.size).toBe(2);
		expect(FAKE_WORKERS).toHaveLength(2);
		void pool.terminate();
	});

	it("should reject when queue exceeds maxQueueSize", async () => {
		const pool = new WorkerPool({
			size: 0,
			maxQueueSize: 0,
			workerScript: "/fake/worker.js",
		});

		await expect(
			pool.execute("generateKeyPair", { algorithm: "ec" })
		).rejects.toThrow("WorkerPool queue is full");
		await pool.terminate();
	});

	it("should create with default options", () => {
		const pool = new WorkerPool();
		expect(pool).toBeDefined();
		pool.execute("generateKeyPair", { algorithm: "ec" }).catch(() => {});
		expect(pool.size).toBe(2);
		void pool.terminate();
	});

	it("should handle unknown message id", () => {
		const pool = new WorkerPool({ size: 1, workerScript: "/fake/worker.js" });
		pool.execute("generateKeyPair", { algorithm: "ec" }).catch(() => {});
		triggerMessage(FAKE_WORKERS[0], {
			id: "unknown-id",
			success: true,
			data: null,
		});
		void pool.terminate();
	});

	it("should use default error message when worker sends error without message", async () => {
		const pool = new WorkerPool({ size: 1, workerScript: "/fake/worker.js" });
		const promise = pool.execute("generateKeyPair", { algorithm: "ec" });

		const call = FAKE_WORKERS[0].postMessage.mock.calls[0][0] as { id: string };
		triggerMessage(FAKE_WORKERS[0], { id: call.id, success: false });

		await expect(promise).rejects.toThrow("Unknown worker error");
		await pool.terminate();
	});

	it("should break processQueue when all workers busy with more queued tasks", () => {
		const pool = new WorkerPool({ size: 1, workerScript: "/fake/worker.js" });

		pool.execute("task1", { data: 1 }).catch(() => {});
		pool.execute("task2", { data: 2 }).catch(() => {});
		pool.execute("task3", { data: 3 }).catch(() => {});

		expect(pool.pending).toBe(2);

		const call1 = FAKE_WORKERS[0].postMessage.mock.calls[0][0] as {
			id: string;
		};
		triggerMessage(FAKE_WORKERS[0], {
			id: call1.id,
			success: true,
			data: null,
		});

		expect(pool.pending).toBe(1);
		expect(FAKE_WORKERS[0].postMessage).toHaveBeenCalledTimes(2);

		const call2 = FAKE_WORKERS[0].postMessage.mock.calls[1][0] as {
			id: string;
			type: string;
		};
		expect(call2.type).toBe("task2");

		triggerMessage(FAKE_WORKERS[0], {
			id: call2.id,
			success: true,
			data: null,
		});

		expect(pool.pending).toBe(0);
		expect(FAKE_WORKERS[0].postMessage).toHaveBeenCalledTimes(3);
		void pool.terminate();
	});
});
