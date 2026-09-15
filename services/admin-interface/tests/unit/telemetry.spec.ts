import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/api/_request", () => ({
	getAdminToken: vi.fn(() => "tok-123"),
}));

import { reportError, reportMetric } from "../../src/infrastructure/telemetry";

describe("telemetry", () => {
	const fetchMock = vi.fn();

	beforeEach(() => {
		fetchMock.mockReset();
		globalThis.fetch = fetchMock;
		fetchMock.mockResolvedValue({ ok: true } as Response);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should report a web-vitals metric as a vital beacon", () => {
		reportMetric({ name: "LCP", value: 250, rating: "good" } as never);

		expect(fetchMock).toHaveBeenCalledWith(
			"/v1/telemetry",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({ "x-api-key": "tok-123" }),
			})
		);
		const [, init] = fetchMock.mock.calls[0];
		expect(JSON.parse(init.body)).toEqual({
			type: "vital",
			name: "LCP",
			value: 250,
			rating: "good",
		});
	});

	it("should report an error beacon", () => {
		reportError(new Error("boom"));

		const [, init] = fetchMock.mock.calls[0];
		expect(JSON.parse(init.body).type).toBe("error");
		expect(JSON.parse(init.body).name).toBe("Error");
		expect(JSON.parse(init.body).message).toBe("boom");
	});

	it("should swallow reporting failures", () => {
		fetchMock.mockRejectedValue(new Error("network down"));

		expect(() => reportError(new Error("boom"))).not.toThrow();
	});
});
