import { describe, expect, it, jest } from "@jest/globals";
import { ErrorBuffer } from "../../../src/middleware/error-buffer";

describe("ErrorBuffer", () => {
	it("should start with zero pending items", () => {
		const buffer = new ErrorBuffer(
			"http://endpoint",
			10,
			"svc" as never,
			"i-1" as never
		);
		expect(buffer.pendingCount).toBe(0);
	});

	it("should add error reports", () => {
		const buffer = new ErrorBuffer(
			"http://endpoint",
			10,
			"svc" as never,
			"i-1" as never
		);
		buffer.add({ message: "error" } as never);
		expect(buffer.pendingCount).toBe(1);
	});

	it("should flush when batch size reached", async () => {
		const fetchSpy = jest
			.spyOn(globalThis as any, "fetch")
			.mockResolvedValue({ ok: true } as never);
		const buffer = new ErrorBuffer(
			"http://endpoint",
			3,
			"svc" as never,
			"i-1" as never
		);
		buffer.add({ message: "e1" } as never);
		buffer.add({ message: "e2" } as never);
		buffer.add({ message: "e3" } as never);
		expect(fetchSpy).toHaveBeenCalled();
		// Wait for fire-and-forget auto-flush to complete before restoring mock
		await new Promise<void>((resolve) => setImmediate(resolve));
		fetchSpy.mockRestore();
	});

	it("should do nothing on flush when empty", async () => {
		const buffer = new ErrorBuffer(
			"http://endpoint",
			10,
			"svc" as never,
			"i-1" as never
		);
		await buffer.flush();
		expect(buffer.pendingCount).toBe(0);
	});

	it("should flush pending items", async () => {
		const fetchSpy = jest
			.spyOn(globalThis as any, "fetch")
			.mockResolvedValue({ ok: true } as never);
		const buffer = new ErrorBuffer(
			"http://endpoint",
			10,
			"svc" as never,
			"i-1" as never
		);
		buffer.add({ message: "test" } as never);
		await buffer.flush();
		expect(fetchSpy).toHaveBeenCalled();
		fetchSpy.mockRestore();
	});

	it("should handle fetch errors gracefully", async () => {
		const fetchSpy = jest
			.spyOn(globalThis as any, "fetch")
			.mockRejectedValue(new Error("network error"));
		const buffer = new ErrorBuffer(
			"http://endpoint",
			10,
			"svc" as never,
			"i-1" as never
		);
		buffer.add({ message: "test" } as never);
		await buffer.flush();
		fetchSpy.mockRestore();
	});
});
