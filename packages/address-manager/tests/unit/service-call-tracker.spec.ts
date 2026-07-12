import { beforeEach, describe, expect, test } from "@jest/globals";
import { HttpMethod } from "@trading-model/common/contracts/signed-request";
import {
	toServiceId,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import {
	CallStatus,
	ServiceCallTracker,
} from "../../src/monitoring/service-call-tracker";

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
				method: HttpMethod.Post,
				timestamp: UnixTimestamp.now(),
				durationMs: 100,
				status: CallStatus.Success,
				bytesSent: 50,
				bytesReceived: 200,
			});
			tracker.record({
				targetService: toServiceId("svc-a"),
				endpoint: "/register",
				method: HttpMethod.Post,
				timestamp: UnixTimestamp.now(),
				durationMs: 200,
				status: CallStatus.Success,
				bytesSent: 50,
				bytesReceived: 200,
			});
			tracker.record({
				targetService: toServiceId("svc-b"),
				endpoint: "/heartbeat",
				method: "WS" as unknown as HttpMethod,
				timestamp: UnixTimestamp.now(),
				durationMs: 5,
				status: CallStatus.Error,
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
				method: HttpMethod.Get,
				timestamp: UnixTimestamp.now(),
				durationMs: 10,
				status: CallStatus.Success,
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
					method: HttpMethod.Get,
					timestamp: UnixTimestamp.now(),
					durationMs: i,
					status: CallStatus.Success,
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
				method: HttpMethod.Get,
				timestamp: UnixTimestamp.of(1000),
				durationMs: 50,
				status: CallStatus.Success,
			});
			const records = tracker.getRecords();
			expect(records).toHaveLength(1);
			expect(records[0].durationMs).toBe(50);
		});
	});
});
