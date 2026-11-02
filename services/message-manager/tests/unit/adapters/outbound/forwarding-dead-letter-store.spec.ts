import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import { createHttpClientError } from "@trading-model/http/adapters/outbound/http-client-errors";

const METRICS = {
	DLQ_FALLBACK_PENDING: { inc: jest.fn(), set: jest.fn() },
	DLQ_FORWARD_FAILURES_TOTAL: { inc: jest.fn() },
	DLQ_REJECTED_TOTAL: { inc: jest.fn() },
	MESSAGES_DLQ_ERROR_TOTAL: { inc: jest.fn() },
};
jest.mock("../../../../src/config/metrics", () => METRICS);

import { ForwardingDeadLetterStore } from "../../../../src/adapters/outbound/forwarding-dead-letter-store";
import { FileDlqRepository } from "../../../../src/infrastructure/fallback/dlq-repository";

const entry = (id: number) =>
	({ message: { id }, deliveryAttempt: 1, timestamp: 1 }) as never;

describe("ForwardingDeadLetterStore", () => {
	let dir: string;
	let file: FileDlqRepository;
	let path: string;
	const remote = { insert: jest.fn<(e: unknown) => Promise<void>>() };

	const fileLines = (p: string): unknown[] => {
		try {
			return readFileSync(p, "utf-8")
				.trim()
				.split("\n")
				.filter(Boolean)
				.map((l) => JSON.parse(l).message);
		} catch {
			return [];
		}
	};

	beforeEach(() => {
		jest.clearAllMocks();
		dir = mkdtempSync(join(tmpdir(), "dlq-forward-"));
		path = join(dir, "dlq.jsonl");
		file = new FileDlqRepository(path);
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it("should store the dead letter in dlq-service, not in the file", async () => {
		remote.insert.mockResolvedValue(undefined);
		const store = new ForwardingDeadLetterStore(remote, file);

		await store.insert(entry(1));

		expect(remote.insert).toHaveBeenCalledWith(entry(1));
		expect(fileLines(path)).toEqual([]);
	});

	it("should keep the dead letter in the file while dlq-service is down", async () => {
		remote.insert.mockRejectedValue(new Error("connect ECONNREFUSED"));
		const store = new ForwardingDeadLetterStore(remote, file);

		await store.insert(entry(1));

		expect(fileLines(path)).toEqual([{ id: 1 }]);
		expect(METRICS.DLQ_FORWARD_FAILURES_TOTAL.inc).toHaveBeenCalled();
		expect(METRICS.DLQ_FALLBACK_PENDING.inc).toHaveBeenCalled();
	});

	it("should send the kept dead letters once dlq-service is back", async () => {
		remote.insert.mockRejectedValue(new Error("connect ECONNREFUSED"));
		const store = new ForwardingDeadLetterStore(remote, file);
		await store.insert(entry(1));
		await store.insert(entry(2));

		remote.insert.mockResolvedValue(undefined);
		await store.forwardPending();

		expect(remote.insert).toHaveBeenLastCalledWith(entry(2));
		expect(fileLines(path)).toEqual([]);
		expect(METRICS.DLQ_FALLBACK_PENDING.set).toHaveBeenLastCalledWith(0);
	});

	it("should set aside what dlq-service refuses for good", async () => {
		remote.insert.mockRejectedValue(createHttpClientError("bad", 400 as never));
		const store = new ForwardingDeadLetterStore(remote, file);

		await store.insert(entry(1));
		await store.forwardPending();

		expect(METRICS.DLQ_REJECTED_TOTAL.inc).toHaveBeenCalledTimes(2);
		expect(METRICS.DLQ_FALLBACK_PENDING.inc).not.toHaveBeenCalled();
		expect(fileLines(path)).toEqual([]);
		expect(fileLines(`${path}.rejected`)).toEqual([{ id: 1 }]);
	});

	it("should propagate a file failure: the dead letter is then lost", async () => {
		remote.insert.mockRejectedValue(new Error("connect ECONNREFUSED"));
		const broken = new FileDlqRepository(join(dir, "missing", "dlq.jsonl"));
		const store = new ForwardingDeadLetterStore(remote, broken);

		await expect(store.insert(entry(1))).rejects.toThrow();
		expect(METRICS.MESSAGES_DLQ_ERROR_TOTAL.inc).toHaveBeenCalledWith({
			target: "file",
		});
	});
});
