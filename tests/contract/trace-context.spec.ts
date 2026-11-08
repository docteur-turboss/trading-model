import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import {
	context,
	propagation,
	ROOT_CONTEXT,
	TraceFlags,
	trace,
} from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { MarketEvent } from "@trading-model/contracts/market-events";
import {
	createRecordingBrokerClient,
	relayThroughMessageManager,
} from "./support/broker-pipeline";

/**
 * Trace context across the bus (issue #599): the publisher's broker client
 * writes the W3C `traceparent` into the metadata, message-manager keeps it
 * through validation and the message factory, and sends the delivery in that
 * context, so the subscriber's server span joins the publisher's trace.
 */

const TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736";
const SPAN_ID = "00f067aa0ba902b7";
const TRACEPARENT = `00-${TRACE_ID}-${SPAN_ID}-01`;

const contextManager = new AsyncLocalStorageContextManager();

beforeAll(() => {
	context.setGlobalContextManager(contextManager.enable());
	propagation.setGlobalPropagator(new W3CTraceContextPropagator());
});

afterAll(() => {
	context.disable();
	propagation.disable();
});

const METADATA = {
	topic: MarketEvent.TestEvent,
	eventType: MarketEvent.TestEvent,
	schemaVersion: "1.0.0",
	publisher: {
		serviceName: "financial-scraper-service",
		instanceId: "financial-scraper-1",
	},
};

async function publishInSpan(): Promise<
	ReturnType<typeof createRecordingBrokerClient>["requests"]
> {
	const broker = createRecordingBrokerClient("financial-scraper-service");
	const spanContext = trace.setSpanContext(ROOT_CONTEXT, {
		traceId: TRACE_ID,
		spanId: SPAN_ID,
		traceFlags: TraceFlags.SAMPLED,
	});
	await context.with(spanContext, () =>
		broker.client.publish({ ping: true }, METADATA as never)
	);
	return broker.requests;
}

describe("trace context on the bus", () => {
	it("carries the publisher's traceparent to the delivery", async () => {
		const [request] = await publishInSpan();
		expect(
			(request.body as { metadata: { traceparent?: string } }).metadata
				.traceparent
		).toBe(TRACEPARENT);

		const relayed = await relayThroughMessageManager(request);

		expect(relayed.accepted).toBe(true);
		if (!relayed.accepted) {
			return;
		}
		expect(relayed.message.metadata.traceparent).toBe(TRACEPARENT);
		// The delivery request is a child of the publish: same trace id.
		expect(relayed.deliveryTraceparent).toMatch(
			new RegExp(`^00-${TRACE_ID}-[0-9a-f]{16}-01$`)
		);
	});

	it("publishes without traceparent outside a span", async () => {
		const broker = createRecordingBrokerClient("financial-scraper-service");
		await broker.client.publish({ ping: true }, METADATA as never);

		const [request] = broker.requests;
		expect(request.body).toEqual({
			payload: { ping: true },
			metadata: expect.not.objectContaining({ traceparent: expect.anything() }),
		});
		const relayed = await relayThroughMessageManager(request);
		expect(relayed.accepted && relayed.deliveryTraceparent).toBeUndefined();
	});

	it("accepts a message with a malformed traceparent and drops it", async () => {
		const [request] = await publishInSpan();
		(
			request.body as { metadata: { traceparent: string } }
		).metadata.traceparent = "not-a-traceparent";

		const relayed = await relayThroughMessageManager(request);

		expect(relayed.accepted).toBe(true);
		expect(
			relayed.accepted && relayed.message.metadata.traceparent
		).toBeUndefined();
	});
});
