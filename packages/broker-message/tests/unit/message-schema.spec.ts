import { describe, expect, it } from "@jest/globals";

import { DlqEvent } from "@trading-model/contracts/dlq-events";
import { TrainingEvent } from "@trading-model/contracts/training-events";

import {
	EVENT_VALIDATORS,
	MESSAGE_PAYLOAD_SCHEMA,
} from "../../src/shared/barrel/message.schema";

describe("MESSAGE_PAYLOAD_SCHEMA", () => {
	describe("auditHeartbeat", () => {
		it("should accept valid heartbeat payload", () => {
			const result = MESSAGE_PAYLOAD_SCHEMA.parse({
				type: "audit.heartbeat" as const,
				data: {
					serviceName: "audit-logger" as any,
					instanceId: "inst-1",
				},
			});
			expect(result).toBeDefined();
			expect((result.data as any).serviceName).toBe("audit-logger");
		});

		it("should reject heartbeat without instanceId", () => {
			expect(() =>
				MESSAGE_PAYLOAD_SCHEMA.parse({
					type: "audit.heartbeat" as const,
					data: { serviceName: "audit-logger" },
				})
			).toThrow();
		});
	});

	describe("auditGapDetected", () => {
		it("should accept valid gap detected payload", () => {
			const result = MESSAGE_PAYLOAD_SCHEMA.parse({
				type: "audit.gap.detected" as const,
				data: {
					from: "2024-01-01T00:00:00Z",
					to: "2024-01-02T00:00:00Z",
					lostCount: 5,
				},
			});
			expect(result).toBeDefined();
			const data = result.data as any;
			expect(data.from).toBeInstanceOf(Date);
			expect(data.to).toBeInstanceOf(Date);
			expect(data.lostCount).toBe(5);
		});

		it("should accept gap detected without optional lostCount", () => {
			const result = MESSAGE_PAYLOAD_SCHEMA.parse({
				type: "audit.gap.detected" as const,
				data: {
					from: "2024-01-01T00:00:00Z",
					to: "2024-01-02T00:00:00Z",
				},
			});
			expect((result.data as any).lostCount).toBeUndefined();
		});
	});
});

describe("training and DLQ events", () => {
	const model = {
		symbol: "BTCUSDT",
		generation: 3,
		fitness: 1,
		sharpe: 1,
		avgPnl: 1,
		maxDrawdown: 0,
		evaluatedOn: "test",
		agentId: "a",
		version: "20261112T000000Z-0123456789ab",
		sha256: "a".repeat(64),
		gaControl: {
			populationSize: 1,
			elitismFraction: 0.1,
			survivorFraction: 0.1,
			episodesPerIndividual: 1,
			selectionType: "tournament",
			fitnessType: "sharpe",
		},
		network: {
			inputDim: 1,
			outputDim: 1,
			hiddenLayers: [{ neurons: 1, activation: "relu" }],
		},
		rl: {
			gamma: 1,
			learningRate: 1,
			epsilonStart: 1,
			epsilonMin: 0,
			epsilonDecay: 1,
		},
	};

	it("covers every event type", () => {
		const types = [...Object.values(TrainingEvent), ...Object.values(DlqEvent)];
		expect(types.every((t) => t in EVENT_VALIDATORS)).toBe(true);
	});

	it("accepts training.model.published and refuses it without sha256", () => {
		const type = "training.model.published";
		expect(
			MESSAGE_PAYLOAD_SCHEMA.safeParse({ type, data: model }).success
		).toBe(true);
		const { sha256: _omitted, ...noSha } = model;
		expect(
			MESSAGE_PAYLOAD_SCHEMA.safeParse({ type, data: noSha }).success
		).toBe(false);
		// The ADR-0069 verdict reaches subscribers instead of being stripped.
		const marked = MESSAGE_PAYLOAD_SCHEMA.safeParse({
			type,
			data: { ...model, admissible: false },
		});
		expect((marked.data?.data as any)?.admissible).toBe(false);
	});

	it("accepts dlq.entry.added", () => {
		const data = { entryId: "1", topic: null, reason: null, actor: null };
		expect(
			MESSAGE_PAYLOAD_SCHEMA.safeParse({ type: "dlq.entry.added", data })
				.success
		).toBe(true);
	});
});
