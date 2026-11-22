import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const calls: string[] = [];
let dirOpenError: NodeJS.ErrnoException | null = null;

jest.mock("node:fs/promises", () => ({
	mkdir: async () => {
		calls.push("mkdir");
	},
	rename: async () => {
		calls.push("rename");
	},
	readFile: async () => "{}",
	open: async (_path: string, flags: string) => {
		const kind = flags === "w" ? "file" : "dir";
		if (kind === "dir" && dirOpenError) {
			throw dirOpenError;
		}
		calls.push(`open:${kind}`);
		return {
			writeFile: async () => calls.push("write"),
			sync: async () => calls.push(`sync:${kind}`),
			close: async () => calls.push(`close:${kind}`),
		};
	},
}));

import { JsonFile } from "../../src/adapters/outbound/json-file";

describe("JsonFile.save", () => {
	beforeEach(() => {
		calls.length = 0;
		dirOpenError = null;
	});

	it("syncs the temporary file before rename and the directory after", async () => {
		await new JsonFile("/data/state.json").save({ a: 1 });
		expect(calls).toEqual([
			"mkdir",
			"open:file",
			"write",
			"sync:file",
			"close:file",
			"rename",
			"open:dir",
			"sync:dir",
			"close:dir",
		]);
	});

	it("ignores a platform that refuses to open a directory", async () => {
		dirOpenError = Object.assign(new Error("denied"), { code: "EPERM" });
		await expect(
			new JsonFile("/data/state.json").save({})
		).resolves.toBeUndefined();
	});

	it("rethrows any other directory error", async () => {
		dirOpenError = Object.assign(new Error("io"), { code: "EIO" });
		await expect(new JsonFile("/data/state.json").save({})).rejects.toThrow(
			"io"
		);
	});
});
