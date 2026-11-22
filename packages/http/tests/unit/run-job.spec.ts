import { SpanStatusCode, trace } from "@opentelemetry/api";
import { getCorrelationId, runJob } from "../../src/correlation-id";

const span = {
	recordException: jest.fn(),
	setStatus: jest.fn(),
	end: jest.fn(),
};

beforeEach(() => {
	jest.clearAllMocks();
	jest.spyOn(trace, "getTracer").mockReturnValue({
		startActiveSpan: (...args: unknown[]) =>
			(args[args.length - 1] as (s: typeof span) => unknown)(span),
	} as never);
});

describe("runJob", () => {
	it("runs fn in a fresh correlation id, returns its value and ends the span", async () => {
		await expect(
			runJob("job", async () => getCorrelationId())
		).resolves.toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/));
		expect(span.end).toHaveBeenCalledTimes(1);
		expect(span.setStatus).not.toHaveBeenCalled();
	});

	it("records the error, sets ERROR, ends the span and rethrows", async () => {
		const boom = new Error("boom");
		await expect(runJob("job", () => Promise.reject(boom))).rejects.toBe(boom);
		expect(span.recordException).toHaveBeenCalledWith(boom);
		expect(span.setStatus).toHaveBeenCalledWith({
			code: SpanStatusCode.ERROR,
			message: "boom",
		});
		expect(span.end).toHaveBeenCalledTimes(1);
	});
});
