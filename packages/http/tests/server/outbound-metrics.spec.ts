import { outboundRequestDurationSeconds } from "../../src/outbound-metrics";

describe("outboundRequestDurationSeconds", () => {
	it("has finite buckets up to the longest outbound timeout (10 s)", () => {
		const upperBounds = (
			outboundRequestDurationSeconds as unknown as { upperBounds: number[] }
		).upperBounds;
		expect(
			Math.max(...upperBounds.filter(Number.isFinite))
		).toBeGreaterThanOrEqual(10);
	});
});
