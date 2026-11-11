import { describe, expect, it } from "@jest/globals";
import { e2eTestTimeout, externalRequest, GATEWAY_API_KEY } from "./helpers";

const AUTH = { "x-api-key": GATEWAY_API_KEY };
const PATH = "/v1/discovery-server/services";

/** Polls until the edge answers 200 again (the bucket drains at 20 r/s). */
async function waitForBucket(): Promise<number> {
	let status = 0;
	for (let i = 0; i < 20 && status !== 200; i++) {
		({ status } = await externalRequest(PATH, { headers: AUTH }));
		if (status !== 200) {
			await new Promise((r) => setTimeout(r, 500));
		}
	}
	return status;
}

/**
 * The edge-proxy answers 429 above 20 r/s + burst 60 per client address.
 * Run serially (jest `maxWorkers: 1`): the E2E specs share one address.
 */
describe("edge-proxy rate limit E2E", () => {
	it(
		"returns 429 on a burst beyond the limit, 200 again once the bucket drained",
		async () => {
			const burst = await Promise.all(
				Array.from({ length: 300 }, () =>
					externalRequest(PATH, { headers: AUTH })
				)
			);
			expect(burst.some((r) => r.status === 429)).toBe(true);
			expect(await waitForBucket()).toBe(200);
		},
		e2eTestTimeout
	);

	it(
		"never answers 429 at nominal rate (~2 r/s)",
		async () => {
			expect(await waitForBucket()).toBe(200);
			for (let i = 0; i < 10; i++) {
				const { status } = await externalRequest(PATH, { headers: AUTH });
				expect(status).toBe(200);
				await new Promise((r) => setTimeout(r, 500));
			}
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
