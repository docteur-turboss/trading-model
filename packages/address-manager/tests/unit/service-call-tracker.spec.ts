import { beforeEach, describe, expect, test } from "@jest/globals";
import { toServiceId } from "@trading-model/common/domain/primitives";
import { UnixTimestamp } from "@trading-model/common/domain/primitives/unix-timestamp";
import { ServiceCallTracker } from "../../src/monitoring/service-call-tracker";

describe("ServiceCallTracker", () => {
	let tracker: ServiceCallTracker;

	beforeEach(() => {
		tracker = new ServiceCallTracker();
	});

	describe("snapshot", () => {
		test("should return empty snapshot when no records", () => {
			const snap = tracker.snapshot();
			expect(snap.totalCalls).toBe(0);
			expect(snap.callsByService).toEqual({});
			expect(snap.callsByEndpoint).toEqual({});
			expect(snap.errorsTotal).toBe(0);
			expect(snap.avgLatencyMs).toBe(0);
			expect(snap.totalBytesSent).toBe(0);
			expect(snap.totalBytesReceived).toBe(0);
		});

		test("should aggregate records correctly", () => {
			tracker.record({
				targetService: toServiceId("svc-a"),
				endpoint: "/register",
				method: "POST",
				timestamp: UnixTimestamp.now(),
				durationMs: 100,
				status: "success",
				bytesSent: 50,
				bytesReceived: 200,
			});
			tracker.record({
				targetService: toServiceId("svc-a"),
				endpoint: "/register",
				method: "POST",
				timestamp: UnixTimestamp.now(),
				durationMs: 200,
				status: "success",
				bytesSent: 50,
				bytesReceived: 200,
			});
			tracker.record({
				targetService: toServiceId("svc-b"),
				endpoint: "/heartbeat",
				method: "WS",
				timestamp: UnixTimestamp.now(),
				durationMs: 5,
				status: "error",
				errorMessage: "timeout",
			});

			const snap = tracker.snapshot();
			expect(snap.totalCalls).toBe(3);
			expect(snap.callsByService).toEqual({ "svc-a": 2, "svc-b": 1 });
			expect(snap.callsByEndpoint).toEqual({
				"POST /register": 2,
				"WS /heartbeat": 1,
			});
			expect(snap.errorsTotal).toBe(1);
			expect(snap.avgLatencyMs).toBe(102); // Math.round((100+200+5)/3) = 102
			expect(snap.totalBytesSent).toBe(100);
			expect(snap.totalBytesReceived).toBe(400);
		});
	});

	describe("clear", () => {
		test("should remove all records", () => {
			tracker.record({
				targetService: toServiceId("svc-a"),
				endpoint: "/ping",
				method: "GET",
				timestamp: UnixTimestamp.now(),
				durationMs: 10,
				status: "success",
			});
			expect(tracker.snapshot().totalCalls).toBe(1);
			tracker.clear();
			expect(tracker.snapshot().totalCalls).toBe(0);
		});
	});

	describe("maxRecords", () => {
		test("should limit total stored records", () => {
			const smallTracker = new ServiceCallTracker(3);
			for (let i = 0; i < 5; i++) {
				smallTracker.record({
					targetService: toServiceId("svc"),
					endpoint: "/test",
					method: "GET",
					timestamp: UnixTimestamp.now(),
					durationMs: i,
					status: "success",
				});
			}
			expect(smallTracker.snapshot().totalCalls).toBe(3);
		});
	});

	describe("getRecords", () => {
		test("should return all stored records as readonly array", () => {
			tracker.record({
				targetService: toServiceId("svc"),
				endpoint: "/test",
				method: "GET",
				timestamp: UnixTimestamp.of(1000),
				durationMs: 50,
				status: "success",
			});
			const records = tracker.getRecords();
			expect(records).toHaveLength(1);
			expect(records[0].durationMs).toBe(50);
		});
	});
});
