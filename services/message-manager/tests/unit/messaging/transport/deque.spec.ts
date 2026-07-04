import { describe, expect, it } from "@jest/globals";
import { Deque } from "../../../../src/messaging/transport/deque";

describe("Deque", () => {
	it("should push and shift items", () => {
		const d = new Deque<number>();
		d.push(1);
		d.push(2);
		expect(d.length).toBe(2);
		expect(d.shift()).toBe(1);
		expect(d.shift()).toBe(2);
	});

	it("should return undefined when shifting empty", () => {
		const d = new Deque<number>();
		expect(d.shift()).toBeUndefined();
	});

	it("should peek front without removing", () => {
		const d = new Deque<string>();
		d.push("a");
		d.push("b");
		expect(d.peekFront()).toBe("a");
		expect(d.length).toBe(2);
	});

	it("should return undefined peeking empty", () => {
		const d = new Deque<number>();
		expect(d.peekFront()).toBeUndefined();
	});

	it("should clear all items", () => {
		const d = new Deque<number>();
		d.push(1);
		d.push(2);
		d.clear();
		expect(d.length).toBe(0);
		expect(d.shift()).toBeUndefined();
	});

	it("should handle zero length", () => {
		const d = new Deque<number>();
		expect(d.length).toBe(0);
	});
});
