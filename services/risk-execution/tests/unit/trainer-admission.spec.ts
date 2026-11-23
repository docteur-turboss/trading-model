import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, jest } from "@jest/globals";

const httpGet = jest.fn<(...args: any[]) => any>();
jest.mock("@trading-model/http/http-client", () => ({
	HttpClient: { createWithTls: () => ({ get: httpGet }) },
}));
jest.mock("../../src/config/address-manager", () => ({
	FIND_A_SERVICE: async () => {
		throw new Error("trainer down");
	},
}));

import { TrainerAdmission } from "../../src/adapters/outbound/trainer-admission";

const VERSION = "20261101T000000Z-aaaaaaaaaaaa";

function store(admission?: { admissible: boolean } | "corrupt") {
	const root = mkdtempSync(join(tmpdir(), "models-"));
	const dir = join(root, "BTCUSDT", VERSION);
	mkdirSync(dir, { recursive: true });
	const manifest =
		admission === "corrupt"
			? "{"
			: JSON.stringify({
					symbol: "BTCUSDT",
					version: VERSION,
					weights: { length: 1, sha256: "a".repeat(64) },
					genome: {},
					admission,
				});
	writeFileSync(join(dir, "manifest.json"), manifest);
	return new TrainerAdmission({} as never, root);
}

describe("TrainerAdmission reads the artifact store", () => {
	it("admits from the manifest with the trainer unreachable", async () => {
		await expect(
			store({ admissible: true }).isAdmissible("BTCUSDT", VERSION)
		).resolves.toBe(true);
		await expect(
			store({ admissible: false }).isAdmissible("BTCUSDT", VERSION)
		).resolves.toBe(false);
		await expect(store().isAdmissible("BTCUSDT", VERSION)).resolves.toBe(false);
	});

	it("rejects an unreadable manifest, so the caller fails closed", async () => {
		await expect(
			store("corrupt").isAdmissible("BTCUSDT", VERSION)
		).rejects.toThrow();
	});

	it("falls back to the trainer API when the store has no copy", async () => {
		await expect(
			store().isAdmissible("BTCUSDT", "20261102T000000Z-bbbbbbbbbbbb")
		).rejects.toThrow("trainer down");
	});
});
