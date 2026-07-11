import { describe, expect, it } from "@jest/globals";
import { CircularBuffer } from "../../../src/utils/circular-buffer";

describe("CircularBuffer", () => {
	it("should start empty", () => {
		const buf = new CircularBuffer(5);
		expect(buf.size).toBe(0);
		expect(buf.maxSize).toBe(5);
	});

	it("should add and retrieve items", () => {
		const buf = new CircularBuffer(5);
		buf.add("a");
		buf.add("b");
		expect(buf.size).toBe(2);
		expect(buf.getAll()).toEqual(["a", "b"]);
	});

	it("should drop oldest items when max size exceeded", () => {
		const buf = new CircularBuffer(3);
		buf.add(1);
		buf.add(2);
		buf.add(3);
		buf.add(4);
		expect(buf.size).toBe(3);
		expect(buf.getAll()).toEqual([2, 3, 4]);
	});

	it("should drain items and clear", () => {
		const buf = new CircularBuffer(5);
		buf.add("a");
		buf.add("b");
		const drained = buf.drain();
		expect(drained).toEqual(["a", "b"]);
		expect(buf.size).toBe(0);
	});

	it("should clear all items", () => {
		const buf = new CircularBuffer(5);
		buf.add("a");
		buf.add("b");
		buf.clear();
		expect(buf.size).toBe(0);
		expect(buf.getAll()).toEqual([]);
	});
});
