import { beforeEach, describe, expect, test } from "@jest/globals";
import type {
	Bytes,
	DurationMs,
} from "@trading-model/common/domain/primitives";
import {
	toServiceId,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import { HttpMethod } from "@trading-model/validation/adapters/inbound/signed-request";
import {
	CallStatus,
	Endpoint,
	ServiceCallTracker,
} from "../../src/infrastructure/monitoring/service-call-tracker";

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
				endpoint: Endpoint.of("/register"),
				method: HttpMethod.Post,
				timestamp: UnixTimestamp.now(),
				durationMs: 100 as DurationMs,
				status: CallStatus.Success,
				bytesSent: 50 as Bytes,
				bytesReceived: 200 as Bytes,
			});
			tracker.record({
				targetService: toServiceId("svc-a"),
				endpoint: Endpoint.of("/register"),
				method: HttpMethod.Post,
				timestamp: UnixTimestamp.now(),
				durationMs: 200 as DurationMs,
				status: CallStatus.Success,
				bytesSent: 50 as Bytes,
				bytesReceived: 200 as Bytes,
			});
			tracker.record({
				targetService: toServiceId("svc-b"),
				endpoint: Endpoint.of("/heartbeat"),
				method: "WS" as unknown as HttpMethod,
				timestamp: UnixTimestamp.now(),
				durationMs: 5 as DurationMs,
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
			const expectedAvgLatency = Math.round((100 + 200 + 5) / 3);
			expect(snap.avgLatencyMs).toBe(expectedAvgLatency);
			expect(snap.totalBytesSent).toBe(100);
			expect(snap.totalBytesReceived).toBe(400);
		});
	});

	describe("clear", () => {
		test("should remove all records", () => {
			tracker.record({
				targetService: toServiceId("svc-a"),
				endpoint: Endpoint.of("/ping"),
				method: HttpMethod.Get,
				timestamp: UnixTimestamp.now(),
				durationMs: 10 as DurationMs,
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
					endpoint: Endpoint.of("/test"),
					method: HttpMethod.Get,
					timestamp: UnixTimestamp.now(),
					durationMs: i as DurationMs,
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
				endpoint: Endpoint.of("/test"),
				method: HttpMethod.Get,
				timestamp: UnixTimestamp.of(1000),
				durationMs: 50 as DurationMs,
				status: CallStatus.Success,
			});
			const records = tracker.getRecords();
			expect(records).toHaveLength(1);
			expect(records[0].durationMs).toBe(50);
		});
	});
});
