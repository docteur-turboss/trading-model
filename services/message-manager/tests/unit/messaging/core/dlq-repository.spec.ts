import { existsSync, readFileSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, jest } from "@jest/globals";
import {
	type DlqEntry,
	FileDlqRepository,
} from "../../../../src/adapters/outbound/dlq-repository";

jest.mock("../../../../src/config/metrics", () => ({
	MESSAGES_DLQ_ERROR_TOTAL: { inc: jest.fn() },
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
				deliveryAttempt: 3,
				timestamp: "2026-06-06T12:00:00.000Z",
			};

			await repo.insert(entry);

			const lines = readFileSync(testFilePath, "utf-8").trim().split("\n");
			expect(lines).toHaveLength(1);

			const parsed = JSON.parse(lines[0]);
			expect(parsed.message).toEqual(entry.message);
			expect(parsed.reason).toBe("DeadLetterError");
			expect(parsed.deliveryAttempt).toBe(3);
			expect(parsed.timestamp).toBe("2026-06-06T12:00:00.000Z");
		});

		it("should append multiple entries as separate lines", async () => {
			const repo = new FileDlqRepository(testFilePath);

			await repo.insert({
				message: { id: 1 },
				deliveryAttempt: 1,
				timestamp: "2026-06-06T12:00:01.000Z",
			});

			await repo.insert({
				message: { id: 2 },
				reason: "TTL_EXPIRED",
				deliveryAttempt: 2,
				timestamp: "2026-06-06T12:00:02.000Z",
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
				deliveryAttempt: 0,
				timestamp: "2026-06-06T12:00:03.000Z",
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
				MESSAGES_DLQ_ERROR_TOTAL: { inc: jest.Mock };
			}>("../../../../src/config/metrics");

			await expect(
				repo.insert({
					message: { payload: "test" },
					deliveryAttempt: 1,
					timestamp: "2026-06-06T12:00:04.000Z",
				})
			).rejects.toThrow("disk full");

			expect(MESSAGES_DLQ_ERROR_TOTAL.inc).toHaveBeenCalledWith({
				target: "file",
			});
			appendSpy.mockRestore();
		});
	});
});
