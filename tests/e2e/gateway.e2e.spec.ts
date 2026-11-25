import { describe, expect, it } from "@jest/globals";
import { externalRequest, GATEWAY_API_KEY } from "./helpers";

const AUTH = { "x-api-key": GATEWAY_API_KEY };

/** External clients reach the gateway through the edge proxy (/v1 -> gateway). */
describe("API Gateway E2E", () => {
	it("rejects proxy requests without an API key", async () => {
		const { status } = await externalRequest(
			"/v1/trader-trainer/training-status"
		);
		expect(status).toBe(401);
	});

	it("rejects an unknown API key", async () => {
		const { status } = await externalRequest(
			"/v1/trader-trainer/training-status",
			{
				headers: { "x-api-key": "not-a-key" },
			}
		);
		expect(status).toBe(401);
	});

	it("proxies to a service by its DNS name, no registry (ADR-0072)", async () => {
		const { status } = await externalRequest(
			"/v1/trader-trainer/training-status",
			{ headers: AUTH }
		);
		expect(status).toBe(200);
	});

	it("routes a canonical service name", async () => {
		const { status, body } = await externalRequest(
			"/v2/financial-scraper/candles/symbols/BTCUSDT",
			{ headers: AUTH }
		);
		expect(status).toBe(200);
		expect(body).toContain("BTCUSDT");
	});

	it("no longer serves financial-scraper under /v1 (breaking change of 3.0.0)", async () => {
		const { status } = await externalRequest(
			"/v1/financial-scraper/candles/symbols/BTCUSDT",
			{ headers: AUTH }
		);
		expect(status).toBe(404);
	});

	it("serves the signals of an asset, every dimension (ADR-0036)", async () => {
		const { status, body } = await externalRequest(
			"/v2/financial-scraper/signals/assets/WHEAT?from=2026-01-01&to=2100-01-01",
			{ headers: AUTH }
		);
		expect(status).toBe(200);
		// CI never calls the real sources (SIGNAL_COLLECTION_ENABLED=false): no signal yet.
		expect(JSON.parse(body)).toMatchObject({
			asset: { id: "WHEAT", sector: "agriculture" },
			signals: [],
			truncated: false,
		});
	});

	it("lists the registry assets and sources, without key variables", async () => {
		const { status, body } = await externalRequest(
			"/v2/financial-scraper/signals/sources",
			{ headers: AUTH }
		);
		expect(status).toBe(200);
		expect(JSON.parse(body).sources[0]).toHaveProperty("termsUrl");
	});

	// Service-to-service routes of scripts/api-contract.mjs SERVICE_TO_SERVICE, none in PUBLIC_ROUTES.
	it.each([
		["/v1/risk-execution/intents", "POST"],
		["/v1/risk-execution/positions/BTCUSDT", "GET"],
		["/v1/trader-trainer/models/BTCUSDT/1/weights", "GET"],
		["/v2/financial-scraper/candles/latest", "GET"],
	])("does not lend its identity to %s (%s)", async (path, method) => {
		// The gateway calls services with its own SVID: service-to-service
		// routes stay out of reach of API clients.
		const { status } = await externalRequest(path, {
			method,
			headers: AUTH,
			body: { serviceName: "api-gateway", ip: "10.0.0.9", port: 22 },
		});
		expect(status).toBe(404);
	});

	it("answers 404 for an unknown service", async () => {
		const { status } = await externalRequest("/v1/nonexistent-service/ping", {
			headers: AUTH,
		});
		expect(status).toBe(404);
	});
});
