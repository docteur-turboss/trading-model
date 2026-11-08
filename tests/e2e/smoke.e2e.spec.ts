import { describe, expect, it } from "@jest/globals";
import {
	CALLER,
	containerHealth,
	externalRequest,
	GATEWAY_API_KEY,
	meshRequest,
	SERVICE_CONTAINERS,
} from "./helpers";

/** In-mesh hostnames of the services that answer /health/ready over mTLS. */
const MESH_SERVICES = [
	"discovery-server",
	"message-manager",
	"financial-scraper",
	"trader-trainer",
	"api-gateway",
	"audit-logger",
	"dlq-service",
];

describe("Smoke", () => {
	it.each([...SERVICE_CONTAINERS])("%s is healthy", (container) => {
		expect(containerHealth(container)).toBe("healthy");
	});

	it.each(MESH_SERVICES)("%s answers /health/ready over mTLS", (service) => {
		const { status, body } = meshRequest(
			CALLER.scraper,
			`https://${service}:3000/health/ready`
		);
		expect(status).toBe(200);
		expect(["ok", "ready"]).toContain(JSON.parse(body).status);
	});

	it("refuses a client without a certificate at the TLS handshake", () => {
		const { status } = meshRequest(
			CALLER.scraper,
			"https://discovery-server:3000/services",
			{ withoutCert: true }
		);
		expect(status).toBe(0);
	});

	it("serves the edge proxy from the host", async () => {
		const { status } = await externalRequest("/health/ready");
		expect(status).toBe(200);
	});

	it("reaches a service through edge -> gateway -> service", async () => {
		const { status, body } = await externalRequest(
			"/v1/trader-trainer/training-status",
			{ headers: { "x-api-key": GATEWAY_API_KEY } }
		);
		expect(status).toBe(200);
		expect(JSON.parse(body)).toHaveProperty("data.training");
	});
});
