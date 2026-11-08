import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { trace } from "@opentelemetry/api";
import { runWithCorrelationId } from "@trading-model/http/adapters/inbound/correlation-id";
import { formatLogEntry } from "@trading-model/http/infrastructure/console-formatter";
import { toCorrelationId } from "@trading-model/primitives/primitives";

describe("formatLogEntry", () => {
	const timestamp = new Date("2024-01-15T10:30:00.000Z").getTime();

	it("should format log entry without context", () => {
		const result = formatLogEntry({
			label: "INFO",
			timestamp,
			message: "hello world",
		});
		expect(result).toBe(
			'{"ts":"2024-01-15T10:30:00.000Z","level":"INFO","msg":"hello world"}'
		);
	});

	it("should format log entry with context merged into the JSON record", () => {
		const result = formatLogEntry({
			label: "ERROR",
			timestamp,
			message: "something went wrong",
			context: { error: "timeout", id: 42 },
		});
		expect(result).toBe(
			'{"ts":"2024-01-15T10:30:00.000Z","level":"ERROR","msg":"something went wrong","error":"timeout","id":42}'
		);
	});

	describe("ambient fields", () => {
		const base = { label: "INFO", timestamp, message: "m" };
		const parse = (c?: Record<string, string>) =>
			JSON.parse(formatLogEntry({ ...base, context: c }));
		const spanContext = {
			traceId: "0af7651916cd43dd8448eb211c80319c",
			spanId: "b7ad6b7169203331",
			traceFlags: 1,
		};

		afterEach(() => {
			jest.restoreAllMocks();
			delete process.env.SERVICE_NAME;
			delete process.env.INSTANCE_ID;
		});

		it("adds service and instance from the environment", () => {
			process.env.SERVICE_NAME = "api-gateway";
			process.env.INSTANCE_ID = "gw-1";
			expect(parse()).toMatchObject({
				service: "api-gateway",
				instance: "gw-1",
			});
		});

		it("adds correlationId inside the async context only", () => {
			expect(parse()).not.toHaveProperty("correlationId");
			const id = toCorrelationId("corr-1");
			expect(runWithCorrelationId(id, () => parse())).toMatchObject({
				correlationId: "corr-1",
			});
		});

		it("adds trace_id and span_id with an active span, omits them otherwise", () => {
			expect(parse()).not.toHaveProperty("trace_id");
			// No OTel SDK/context manager in unit tests: stub the active span.
			jest
				.spyOn(trace, "getActiveSpan")
				.mockReturnValue(trace.wrapSpanContext(spanContext));
			const out = parse();
			expect(out).toMatchObject({
				trace_id: spanContext.traceId,
				span_id: spanContext.spanId,
			});
		});

		it("lets an explicit context field win over the ambient one", () => {
			const id = toCorrelationId("corr-1");
			const out = runWithCorrelationId(id, () => parse({ correlationId: "x" }));
			expect(out.correlationId).toBe("x");
		});

		it("never lets context override service and instance", () => {
			process.env.SERVICE_NAME = "message-manager";
			process.env.INSTANCE_ID = "mm-1";
			expect(parse({ service: "dest", instance: "other" })).toMatchObject({
				service: "message-manager",
				instance: "mm-1",
			});
		});

		it("keeps context service when SERVICE_NAME is unset", () => {
			expect(parse({ service: "explicit" }).service).toBe("explicit");
		});

		it("does not let an undefined context value erase an ambient field", () => {
			const id = toCorrelationId("corr-1");
			const out = runWithCorrelationId(id, () =>
				formatLogEntry({
					...base,
					context: { correlationId: undefined as unknown as string },
				})
			);
			expect(JSON.parse(out).correlationId).toBe("corr-1");
		});
	});
});
