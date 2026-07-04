import { describe, expect, it, jest } from "@jest/globals";
import { e2eTestTimeout, fetchUrl, PORTS } from "./helpers";

jest.setTimeout(e2eTestTimeout);

const GATEWAY = `https://localhost:${PORTS.gateway}`;
const API_KEY = process.env.AUTH_TOKENS || "test-api-key";

describe("API Gateway E2E", () => {
	it("should respond to ping (no auth)", async () => {
		const { status } = await fetchUrl(`${GATEWAY}/ping`);
		expect(status).toBe(200);
	});

	it("should reject proxy requests without auth", async () => {
		const { status } = await fetchUrl(
			`${GATEWAY}/v1/discovery-server/services`
		);
		expect(status).toBe(401);
	});

	it("should proxy to discovery-server with valid auth", async () => {
		const { status, body } = await fetchUrl(
			`${GATEWAY}/v1/discovery-server/services`,
			{
				headers: { "x-api-key": API_KEY },
			}
		);
		expect(status).toBe(200);
		const parsed = JSON.parse(body);
		expect(typeof parsed).toBe("object");
	});

	it("should proxy health check through gateway", async () => {
		const { status, body } = await fetchUrl(
			`${GATEWAY}/v1/discovery-server/health`,
			{
				headers: { "x-api-key": API_KEY },
			}
		);
		expect(status).toBe(200);
		const parsed = JSON.parse(body);
		expect(parsed).toHaveProperty("redis");
	});

	it("should return 400 for invalid routes", async () => {
		const { status } = await fetchUrl(
			`${GATEWAY}/v1/nonexistent-service/ping`,
			{
				headers: { "x-api-key": API_KEY },
			}
		);
		expect(status).toBeGreaterThanOrEqual(400);
	});
});
