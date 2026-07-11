import { describe, expect, it, jest } from "@jest/globals";
import { TypedEventEmitter } from "../../../src/worker/typed-event-emitter";

describe("TypedEventEmitter", () => {
	it("should emit and listen to events", () => {
		const emitter = new TypedEventEmitter<{ test: [string] }>();
		const listener = jest.fn();
		emitter.on("test", listener);
		emitter.emit("test", "hello");
		expect(listener).toHaveBeenCalledWith("hello");
	});

	it("should remove listener with off", () => {
		const emitter = new TypedEventEmitter<{ test: [string] }>();
		const listener = jest.fn();
		emitter.on("test", listener);
		emitter.off("test", listener);
		emitter.emit("test", "hello");
		expect(listener).not.toHaveBeenCalled();
	});

	it("should emit through raw EventEmitter", () => {
		const emitter = new TypedEventEmitter<{ test: [string] }>();
		const listener = jest.fn();
		emitter.raw.on("test", listener);
		emitter.emit("test", "data");
		expect(listener).toHaveBeenCalledWith("data");
	});

	it("should support multiple listeners", () => {
		const emitter = new TypedEventEmitter<{ test: [string] }>();
		const a = jest.fn();
		const b = jest.fn();
		emitter.on("test", a);
		emitter.on("test", b);
		emitter.emit("test", "val");
		expect(a).toHaveBeenCalledWith("val");
		expect(b).toHaveBeenCalledWith("val");
	});
});
