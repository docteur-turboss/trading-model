import { SpanStatusCode, trace } from "@opentelemetry/api";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getCorrelationId, runJob } from "../../src/correlation-id";

interface ExportedSpan {
	name: string;
	status: { code: SpanStatusCode; message?: string };
	parentSpanContext?: unknown;
}

const exported: ExportedSpan[] = [];
const sdk = new NodeSDK({
	traceExporter: {
		export: (spans: ExportedSpan[], done: (r: { code: 0 }) => void) => {
			exported.push(...spans);
			done({ code: 0 });
		},
		shutdown: async () => undefined,
	},
});

beforeAll(() => sdk.start());

describe("runJob", () => {
	it("runs fn in a valid active root span and a fresh correlation id, then ends the span", async () => {
		const seen = await runJob("job.ok", async () => ({
			id: getCorrelationId(),
			ctx: trace.getActiveSpan()?.spanContext(),
		}));
		expect(seen.id).toMatch(/^[0-9a-f-]{36}$/);
		expect(seen.ctx && trace.isSpanContextValid(seen.ctx)).toBe(true);
	});

	it("calls onError inside the job context, sets ERROR, ends the span and rethrows", async () => {
		const boom = new Error("boom");
		let logged: unknown;
		await expect(
			runJob(
				"job.ko",
				() => Promise.reject(boom),
				(err) => {
					logged = {
						err,
						id: getCorrelationId(),
						span: trace.getActiveSpan()?.spanContext().traceId,
					};
				}
			)
		).rejects.toBe(boom);
		expect(logged).toEqual({
			err: boom,
			id: expect.stringMatching(/^[0-9a-f-]{36}$/),
			span: expect.stringMatching(/^[0-9a-f]{32}$/),
		});
	});

	it("exports both spans as roots, only the failing one in ERROR", async () => {
		await sdk.shutdown();
		const byName = (n: string) => exported.find((s) => s.name === n);
		expect(byName("job.ok")?.parentSpanContext).toBeUndefined();
		expect(byName("job.ko")?.parentSpanContext).toBeUndefined();
		expect(byName("job.ok")?.status.code).not.toBe(SpanStatusCode.ERROR);
		expect(byName("job.ko")?.status).toEqual({
			code: SpanStatusCode.ERROR,
			message: "boom",
		});
	});
});
