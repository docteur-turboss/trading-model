import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { EVENT_MANAGER } from "../../src/event-manager-client";

const METADATA = { topic: "test.event", messageId: "m-1" };
const emitter = EVENT_MANAGER as any;

describe("EVENT_MANAGER", () => {
	beforeEach(() => {
		emitter._emitter.removeAllListeners();
	});

	it("should hand the payload and the metadata to every listener of the event", async () => {
		const callback1 = jest.fn<(...args: any[]) => any>();
		const callback2 = jest.fn<(...args: any[]) => any>();
		const other = jest.fn<(...args: any[]) => any>();
		emitter.on("test.event", callback1);
		emitter.on("test.event", callback2);
		emitter.on("other.event", other);

		await emitter.emit("test.event", { id: "txn-123" }, METADATA);

		expect(callback1).toHaveBeenCalledWith(
			{ id: "txn-123" },
			METADATA,
			undefined
		);
		expect(callback2).toHaveBeenCalledWith(
			{ id: "txn-123" },
			METADATA,
			undefined
		);
		expect(other).not.toHaveBeenCalled();
	});

	it("should return an unsubscribe function", async () => {
		const callback = jest.fn<(...args: any[]) => any>();
		const unsubscribe = emitter.on("test.event", callback);

		await emitter.emit("test.event", { id: "user-1" }, METADATA);
		unsubscribe();
		await emitter.emit("test.event", { id: "user-2" }, METADATA);

		expect(callback).toHaveBeenCalledTimes(1);
	});

	it("should resolve when the event has no listener", async () => {
		await expect(
			emitter.emit("nonexistent.event", { data: "test" }, METADATA)
		).resolves.toBeUndefined();
	});

	// The bus acks only after emit resolves: an async failure must reach it.
	it("should wait for an async listener and reject with its failure", async () => {
		const failing = jest
			.fn<(...args: any[]) => any>()
			.mockRejectedValue(new Error("Listener error"));
		const next = jest.fn<(...args: any[]) => any>();
		emitter.on("error.event", failing);
		emitter.on("error.event", next);

		await expect(
			emitter.emit("error.event", { test: true }, METADATA)
		).rejects.toThrow("Listener error");
		expect(next).not.toHaveBeenCalled();
	});
});
