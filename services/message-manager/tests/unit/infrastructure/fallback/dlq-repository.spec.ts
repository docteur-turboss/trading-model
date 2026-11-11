import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import type {
	PositiveInt,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import {
	type DlqEntry,
	DrainOutcome,
	FileDlqRepository,
} from "../../../../src/infrastructure/fallback/dlq-repository";

jest.mock("../../../../src/config/metrics", () => ({
	MESSAGES_DLQ_ERROR_TOTAL: { inc: jest.fn<(...args: any[]) => any>() },
}));

describe("FileDlqRepository", () => {
	const testFilePath = join(tmpdir(), `dlq-test-${Date.now()}.jsonl`);

	afterAll(async () => {
		if (existsSync(testFilePath)) {
			await unlink(testFilePath);
		}
	});

	describe("insert", () => {
		it("should append a JSON line to the file", async () => {
			const repo = new FileDlqRepository(testFilePath);

			const entry: DlqEntry = {
				message: { payload: "test", metadata: { topic: "test.topic" } },
				reason: "DeadLetterError",
				deliveryAttempt: 3 as PositiveInt,
				timestamp: Date.parse("2026-06-06T12:00:00.000Z") as UnixTimestamp,
			};

			await repo.insert(entry);

			const lines = readFileSync(testFilePath, "utf-8").trim().split("\n");
			expect(lines).toHaveLength(1);

			const parsed = JSON.parse(lines[0]);
			expect(parsed.message).toEqual(entry.message);
			expect(parsed.reason).toBe("DeadLetterError");
			expect(parsed.deliveryAttempt).toBe(3);
			expect(parsed.timestamp).toBe(Date.parse("2026-06-06T12:00:00.000Z"));
		});

		it("should append multiple entries as separate lines", async () => {
			const repo = new FileDlqRepository(testFilePath);

			await repo.insert({
				message: { id: 1 },
				deliveryAttempt: 1 as PositiveInt,
				timestamp: Date.parse("2026-06-06T12:00:01.000Z") as UnixTimestamp,
			});

			await repo.insert({
				message: { id: 2 },
				reason: "TTL_EXPIRED",
				deliveryAttempt: 2 as PositiveInt,
				timestamp: Date.parse("2026-06-06T12:00:02.000Z") as UnixTimestamp,
			});

			const lines = readFileSync(testFilePath, "utf-8").trim().split("\n");
			expect(lines).toHaveLength(3);

			const first = JSON.parse(lines[1]);
			expect(first.message).toEqual({ id: 1 });

			const second = JSON.parse(lines[2]);
			expect(second.message).toEqual({ id: 2 });
			expect(second.reason).toBe("TTL_EXPIRED");
		});

		it("should work with default file path when no path provided", () => {
			const repo = new FileDlqRepository();
			expect(repo).toBeInstanceOf(FileDlqRepository);
		});

		it("should handle entry without reason", async () => {
			const repo = new FileDlqRepository(testFilePath);

			await repo.insert({
				message: "plain string payload",
				deliveryAttempt: 0 as PositiveInt,
				timestamp: Date.parse("2026-06-06T12:00:03.000Z") as UnixTimestamp,
			});

			const line = readFileSync(testFilePath, "utf-8")
				.trim()
				.split("\n")
				.pop()!;
			const parsed = JSON.parse(line);
			expect(parsed.reason).toBeUndefined();
			expect(parsed.message).toBe("plain string payload");
		});

		it("should increment DLQ error metric and rethrow when appendFile fails", async () => {
			const fsPromises =
				jest.requireActual<typeof import("node:fs/promises")>(
					"node:fs/promises"
				);
			const appendSpy = jest
				.spyOn(fsPromises, "appendFile")
				.mockRejectedValue(new Error("disk full"));
			const repo = new FileDlqRepository(testFilePath);
			const { MESSAGES_DLQ_ERROR_TOTAL } = jest.requireMock<{
				MESSAGES_DLQ_ERROR_TOTAL: { inc: jest.Mock<(...args: any[]) => any> };
			}>("../../../../src/config/metrics");

			await expect(
				repo.insert({
					message: { payload: "test" },
					deliveryAttempt: 1 as PositiveInt,
					timestamp: Date.parse("2026-06-06T12:00:04.000Z") as UnixTimestamp,
				})
			).rejects.toThrow("disk full");

			expect(MESSAGES_DLQ_ERROR_TOTAL.inc).toHaveBeenCalledWith({
				target: "file",
			});
			appendSpy.mockRestore();
		});
	});

	describe("drain", () => {
		let dir: string;
		let file: string;

		const entry = (id: number): DlqEntry =>
			({ message: { id }, deliveryAttempt: 1, timestamp: 1 }) as never;
		const lines = (path: string): string[] =>
			existsSync(path)
				? readFileSync(path, "utf-8").trim().split("\n").filter(Boolean)
				: [];

		beforeEach(() => {
			dir = mkdtempSync(join(tmpdir(), "dlq-drain-"));
			file = join(dir, "dlq.jsonl");
		});

		afterEach(() => {
			rmSync(dir, { recursive: true, force: true });
		});

		it("should remove the entries sent and leave no working file", async () => {
			const repo = new FileDlqRepository(file);
			await repo.insert(entry(1));
			await repo.insert(entry(2));
			const sent: unknown[] = [];

			const result = await repo.drain(async (e) => {
				sent.push(e.message);
				return DrainOutcome.Sent;
			});

			expect(sent).toEqual([{ id: 1 }, { id: 2 }]);
			expect(result).toEqual({ sent: 2, kept: 0, rejected: 0 });
			expect(lines(file)).toEqual([]);
			expect(existsSync(`${file}.draining`)).toBe(false);
		});

		// The target is down: waiting for each entry to fail would be useless.
		it("should keep the first unsent entry and the rest without sending them", async () => {
			const repo = new FileDlqRepository(file);
			for (const id of [1, 2, 3]) {
				await repo.insert(entry(id));
			}
			const send = jest.fn(async (e: DlqEntry) =>
				(e.message as { id: number }).id === 1
					? DrainOutcome.Sent
					: DrainOutcome.Kept
			);

			const result = await repo.drain(send);

			expect(send).toHaveBeenCalledTimes(2);
			expect(result).toEqual({ sent: 1, kept: 2, rejected: 0 });
			expect(lines(file).map((l) => JSON.parse(l).message)).toEqual([
				{ id: 2 },
				{ id: 3 },
			]);
			await expect(repo.count()).resolves.toBe(2);
		});

		it("should move rejected entries and lines that are not JSON aside", async () => {
			writeFileSync(file, `${JSON.stringify(entry(1))}\nnot json\n`);
			const repo = new FileDlqRepository(file);

			const result = await repo.drain(async () => DrainOutcome.Rejected);

			expect(result).toEqual({ sent: 0, kept: 0, rejected: 2 });
			expect(lines(file)).toEqual([]);
			expect(lines(`${file}.rejected`)).toHaveLength(2);
		});

		it("should drain again the working file a crash left behind", async () => {
			writeFileSync(`${file}.draining`, `${JSON.stringify(entry(7))}\n`);
			const repo = new FileDlqRepository(file);
			await repo.insert(entry(8));
			const sent: unknown[] = [];

			await repo.drain(async (e) => {
				sent.push(e.message);
				return DrainOutcome.Sent;
			});

			expect(sent).toEqual([{ id: 8 }, { id: 7 }]);
		});

		it("should keep the entries appended while draining", async () => {
			const repo = new FileDlqRepository(file);
			await repo.insert(entry(1));

			await repo.drain(async () => {
				await repo.insert(entry(2));
				return DrainOutcome.Sent;
			});

			expect(lines(file).map((l) => JSON.parse(l).message)).toEqual([
				{ id: 2 },
			]);
		});

		it("should run one drain at a time", async () => {
			const repo = new FileDlqRepository(file);
			await repo.insert(entry(1));
			let release: () => void = () => undefined;
			// Wait for the first drain to reach its sender, not for a delay: under
			// load the file read can take longer and `release` would stay a no-op.
			let reached: () => void = () => undefined;
			const firstInSender = new Promise<void>((resolve) => {
				reached = resolve;
			});
			const first = repo.drain(
				() =>
					new Promise((resolve) => {
						release = () => resolve(DrainOutcome.Sent);
						reached();
					})
			);
			await firstInSender;

			await expect(repo.drain(async () => DrainOutcome.Sent)).resolves.toEqual({
				sent: 0,
				kept: 0,
				rejected: 0,
			});
			release();
			await expect(first).resolves.toEqual({ sent: 1, kept: 0, rejected: 0 });
		});

		it("should drain nothing when there is no file", async () => {
			const repo = new FileDlqRepository(file);
			await expect(repo.drain(async () => DrainOutcome.Sent)).resolves.toEqual({
				sent: 0,
				kept: 0,
				rejected: 0,
			});
			await expect(repo.count()).resolves.toBe(0);
		});
	});
});
