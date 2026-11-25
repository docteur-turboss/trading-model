import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../src/config/dlq-cli", () => ({}));

import { runDlqCli } from "../../src/application/dlq-cli";

function cli(found: Record<string, boolean> = {}) {
	const out: string[] = [];
	const err: string[] = [];
	const publish = jest.fn(async (..._args: any[]) => undefined);
	const streams = {
		list: jest.fn(async (..._args: any[]) => [{ id: "1-0" }]),
		replay: jest.fn(async (_topic: string, id: string) => found[id] ?? true),
		delete: jest.fn(async (_topic: string, id: string) => found[id] ?? true),
	};
	return {
		out,
		err,
		publish,
		streams,
		run: (args: string[]) =>
			runDlqCli(args, {
				streams,
				publish: publish as never,
				out: (text) => out.push(text),
				err: (text) => err.push(text),
			}),
	};
}

describe("dlq-cli", () => {
	it("lists the dead letters of a topic", async () => {
		const { run, out, streams } = cli();

		await expect(run(["alice", "list", "t"])).resolves.toBe(0);

		expect(streams.list).toHaveBeenCalledWith("t", undefined);
		expect(JSON.parse(out[0] as string)).toEqual([{ id: "1-0" }]);
	});

	it("passes the cursor of a list page", async () => {
		const { run, streams } = cli();

		await expect(run(["alice", "list", "t", "5-0"])).resolves.toBe(0);

		expect(streams.list).toHaveBeenCalledWith("t", "5-0");
	});

	it("replays entries and records dlq.replay.completed with the operator as actor", async () => {
		const { run, publish } = cli({ "2-0": false });

		await expect(run(["alice", "replay", "t", "1-0", "2-0"])).resolves.toBe(1);

		expect(publish).toHaveBeenCalledWith(
			"dlq.replay.completed",
			expect.objectContaining({
				topic: "t",
				replayed: 1,
				failed: 1,
				actor: "alice",
			})
		);
	});

	it("publishes the audit event for the entries done before an error, then rethrows", async () => {
		const { run, publish, streams, err } = cli();
		streams.replay
			.mockResolvedValueOnce(true)
			.mockRejectedValueOnce(new Error("redis down"));

		await expect(run(["alice", "replay", "t", "1-0", "2-0"])).rejects.toThrow(
			"redis down"
		);
		expect(publish).toHaveBeenCalledWith(
			"dlq.replay.completed",
			expect.objectContaining({ replayed: 1, failed: 1 })
		);
		expect(err).toEqual([]);

		publish.mockRejectedValueOnce(new Error("bus down"));
		streams.delete.mockRejectedValueOnce(new Error("redis down"));
		await expect(run(["alice", "delete", "t", "1-0"])).rejects.toThrow(
			"redis down"
		);
		expect(err[0]).toContain("bus down");
	});

	it("deletes entries and records dlq.entries.deleted", async () => {
		const { run, publish, streams } = cli();

		await expect(run(["alice", "delete", "t", "1-0"])).resolves.toBe(0);

		expect(streams.delete).toHaveBeenCalledWith("t", "1-0");
		expect(publish).toHaveBeenCalledWith("dlq.entries.deleted", {
			ids: ["1-0"],
			deleted: 1,
			actor: "alice",
		});
	});

	it.each([
		[[]],
		[["alice", "replay", "t"]],
		[["alice", "list", "t", "1-0", "2-0"]],
		[["alice", "purge", "t"]],
	])("prints the usage and exits 2 for %j", async (args) => {
		const { run, err, publish } = cli();

		await expect(run(args)).resolves.toBe(2);

		expect(err[0]).toContain("audit-logger pod");
		expect(publish).not.toHaveBeenCalled();
	});
});
