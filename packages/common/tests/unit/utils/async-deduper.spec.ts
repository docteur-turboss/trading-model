import { describe, expect, it, jest } from "@jest/globals";
import { AsyncDeduper } from "../../../src/utils/async-deduper";

describe("AsyncDeduper", () => {
	it("should run the factory and return the result", async () => {
		const deduper = new AsyncDeduper<string>();
		const result = await deduper.run(async () => "hello");
		expect(result).toBe("hello");
	});

	it("should deduplicate concurrent calls", async () => {
		const deduper = new AsyncDeduper<string>();
		let resolveFactory: (v: string) => void;
		const factory = jest.fn<() => Promise<string>>().mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveFactory = resolve;
				})
		);

		const p1 = deduper.run(factory);
		const p2 = deduper.run(factory);

		resolveFactory!("result");

		const [r1, r2] = await Promise.all([p1, p2]);
		expect(r1).toBe("result");
		expect(r2).toBe("result");
		expect(factory).toHaveBeenCalledTimes(1);
	});

	it("should run factory again after previous completes", async () => {
		const deduper = new AsyncDeduper<string>();
		const factory = jest.fn<() => Promise<string>>().mockResolvedValue("done");

		await deduper.run(factory);
		await deduper.run(factory);

		expect(factory).toHaveBeenCalledTimes(2);
	});

	it("should have pending promise after starting", async () => {
		const deduper = new AsyncDeduper<string>();
		expect(deduper.pending).toBeNull();

		let resolveFactory: (v: string) => void;
		const promise = deduper.run(
			() =>
				new Promise((resolve) => {
					resolveFactory = resolve;
				})
		);
		expect(deduper.pending).not.toBeNull();
		resolveFactory!("test");
		await expect(promise).resolves.toBe("test");
	});

	it("should clear pending promise on completion", async () => {
		const deduper = new AsyncDeduper<string>();
		await deduper.run(async () => "test");
		expect(deduper.pending).toBeNull();
	});

	it("should clear pending promise via clear()", () => {
		const deduper = new AsyncDeduper<string>();
		void deduper.run(async () => "test");
		deduper.clear();
		expect(deduper.pending).toBeNull();
	});

	it("should handle factory rejection", async () => {
		const deduper = new AsyncDeduper<string>();
		const error = new Error("fail");

		await expect(
			deduper.run(async () => {
				throw error;
			})
		).rejects.toThrow("fail");
		expect(deduper.pending).toBeNull();
	});
});
