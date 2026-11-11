import { describe, expect, it } from "@jest/globals";
import { e2eTestTimeout, externalRequest, GATEWAY_API_KEY } from "./helpers";

const AUTH = { "x-api-key": GATEWAY_API_KEY };
const PATH = "/v1/discovery-server/services";

/** The edge-proxy answers 429 above 20 r/s + burst 60 per client address. */
describe("edge-proxy rate limit E2E", () => {
	it(
		"returns 429 on a burst beyond the limit, 200 again at nominal rate",
		async () => {
			const burst = await Promise.all(
				Array.from({ length: 300 }, () =>
					externalRequest(PATH, { headers: AUTH })
				)
			);
			expect(burst.some((r) => r.status === 429)).toBe(true);

			// bucket drains at 20 r/s: 60 excess slots free after ~3 s
			await new Promise((resolve) => setTimeout(resolve, 5000));
			const { status } = await externalRequest(PATH, { headers: AUTH });
			expect(status).toBe(200);
		},
		e2eTestTimeout
	);

	it("never limits /ping", async () => {
		const results = await Promise.all(
			Array.from({ length: 300 }, () => externalRequest("/ping"))
		);
		expect(results.every((r) => r.status === 200)).toBe(true);
	});
});
