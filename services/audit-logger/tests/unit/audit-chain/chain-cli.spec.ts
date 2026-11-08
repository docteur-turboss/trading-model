import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../src/infrastructure/config/env", () => ({ ENV: {} }));
jest.mock("../../../src/config/container", () => ({}));

import type { ChainReport } from "../../../src/application/audit-chain/chain-audit";
import { runChainCli } from "../../../src/application/chain-cli";

function cli(broken: string | null = null) {
	const audit = {
		report: jest.fn(
			async () =>
				({
					verification: { broken, count: 3, verifiedUpTo: null },
				}) as unknown as ChainReport
		),
		acknowledgeLoss: jest.fn(async (..._args: any[]) => undefined),
	};
	const close = jest.fn(async (..._args: any[]) => undefined);
	const out: string[] = [];
	const err: string[] = [];
	const deps = {
		open: async () => ({ audit, close }),
		out: (text: string) => out.push(text),
		err: (text: string) => err.push(text),
	};
	return {
		audit,
		close,
		out,
		err,
		run: (args: string[]) => runChainCli(args, deps),
	};
}

describe("chain-cli", () => {
	it("prints the report and exits 0 on a chain that holds", async () => {
		const { run, out, close } = cli();

		await expect(run(["report"])).resolves.toBe(0);
		expect(JSON.parse(out[0])).toMatchObject({ verification: { count: 3 } });
		expect(close).toHaveBeenCalled();
	});

	it("exits 1 on a broken chain", async () => {
		await expect(cli("chainSequence 2: ...").run(["report"])).resolves.toBe(1);
	});

	it("acknowledges a loss with its reason", async () => {
		const { run, audit, out } = cli();

		await expect(
			run(["acknowledge-loss", "42", "restore", "of", "2026-10-31"])
		).resolves.toBe(0);
		expect(audit.acknowledgeLoss).toHaveBeenCalledWith(
			42,
			"restore of 2026-10-31"
		);
		expect(out).toEqual(["Loss acknowledged from sequence 42"]);
	});

	it.each([
		[[]],
		[["unknown"]],
		[["acknowledge-loss", "x", "r"]],
		[["acknowledge-loss", "4"]],
	])("prints the usage on %j", async (args) => {
		const { run, err, audit } = cli();

		await expect(run(args)).resolves.toBe(2);
		expect(err[0]).toMatch(/^Audit chain tools/);
		expect(audit.report).not.toHaveBeenCalled();
	});

	it("closes the connection when the command fails", async () => {
		const { run, audit, close } = cli();
		audit.report.mockRejectedValueOnce(new Error("mongo down"));

		await expect(run(["report"])).rejects.toThrow("mongo down");
		expect(close).toHaveBeenCalled();
	});
});
