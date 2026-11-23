import { describe, expect, it, jest } from "@jest/globals";
import { runCli } from "../../../src/utils/run-cli";

describe("runCli", () => {
	const flush = () => new Promise((r) => setImmediate(r));

	it("exits with the code of main", async () => {
		const exit = jest
			.spyOn(process, "exit")
			.mockImplementation((() => undefined) as never);
		runCli(async () => 3);
		await flush();
		expect(exit).toHaveBeenCalledWith(3);
		exit.mockRestore();
	});

	it("logs the message and exits 1 on rejection", async () => {
		const exit = jest
			.spyOn(process, "exit")
			.mockImplementation((() => undefined) as never);
		const err = jest
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		runCli(async () => {
			throw new Error("boom");
		});
		await flush();
		expect(err).toHaveBeenCalledWith("boom");
		expect(exit).toHaveBeenCalledWith(1);
		exit.mockRestore();
		err.mockRestore();
	});
});
