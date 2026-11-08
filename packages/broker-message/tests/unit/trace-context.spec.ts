import { context, propagation, ROOT_CONTEXT } from "@opentelemetry/api";
import { TRACEPARENT_METADATA_PREDICATE } from "../../src/shared/barrel/message.schema";
import {
	runInMessageTraceContext,
	withTraceparent,
} from "../../src/shared/trace-context";

const TRACEPARENT = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
const METADATA = { topic: "market.test.event" } as never;

afterEach(() => {
	jest.restoreAllMocks();
});

describe("withTraceparent", () => {
	it("adds the traceparent of the active context", () => {
		jest.spyOn(propagation, "inject").mockImplementation((_ctx, carrier) => {
			(carrier as Record<string, string>).traceparent = TRACEPARENT;
		});

		expect(withTraceparent(METADATA)).toEqual({
			topic: "market.test.event",
			traceparent: TRACEPARENT,
		});
	});

	it("leaves the metadata unchanged without an active span", () => {
		expect(withTraceparent(METADATA)).toBe(METADATA);
	});
});

describe("runInMessageTraceContext", () => {
	it("runs in the context extracted from the traceparent", () => {
		const extracted = ROOT_CONTEXT.setValue(Symbol("span"), "publisher");
		const extract = jest
			.spyOn(propagation, "extract")
			.mockReturnValue(extracted);
		const withContext = jest.spyOn(context, "with");

		expect(
			runInMessageTraceContext({ traceparent: TRACEPARENT }, () => 42)
		).toBe(42);
		expect(extract).toHaveBeenCalledWith(ROOT_CONTEXT, {
			traceparent: TRACEPARENT,
		});
		expect(withContext).toHaveBeenCalledWith(extracted, expect.any(Function));
	});

	it("runs in the current context without traceparent", () => {
		const withContext = jest.spyOn(context, "with");

		expect(runInMessageTraceContext({}, () => "done")).toBe("done");
		expect(withContext).not.toHaveBeenCalled();
	});
});

describe("TRACEPARENT_METADATA_PREDICATE", () => {
	it("keeps a W3C traceparent and drops anything else", () => {
		expect(TRACEPARENT_METADATA_PREDICATE.parse(TRACEPARENT)).toBe(TRACEPARENT);
		expect(TRACEPARENT_METADATA_PREDICATE.parse("00-xyz")).toBeUndefined();
		expect(TRACEPARENT_METADATA_PREDICATE.parse(undefined)).toBeUndefined();
	});
});
