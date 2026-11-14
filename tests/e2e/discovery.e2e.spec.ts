import { describe, expect, it } from "@jest/globals";
import { CALLER, containerIp, meshRequest } from "./helpers";

const DISCOVERY = "https://discovery-server:3000";
/** The scraper's SVID only lets it register instances of its own service. */
const SERVICE = "financial-scraper";
const INSTANCE = `e2e-instance-${Date.now()}`;

function discovery(
	path: string,
	method = "GET",
	body?: unknown,
	token?: string
) {
	return meshRequest(CALLER.scraper, `${DISCOVERY}${path}`, {
		method,
		body,
		headers: token ? { "x-instance-token": token } : {},
	});
}

describe("Discovery E2E", () => {
	let token = "";

	it("responds to ping", () => {
		expect(discovery("/ping").status).toBe(200);
	});

	it("reports Redis ready", () => {
		const { status, body } = discovery("/health/ready");
		expect(status).toBe(200);
		expect(JSON.parse(body)).toHaveProperty("checks.redis", "ok");
	});

	it("registers an instance of the caller's own service at its observed address", () => {
		const { status, body } = discovery("/register", "POST", {
			serviceName: SERVICE,
			instanceId: INSTANCE,
			ip: "10.255.255.1",
			port: 3000,
		});
		expect(status).toBe(201);
		const registered = JSON.parse(body);
		expect(registered).toHaveProperty("instanceId", INSTANCE);
		// The declared IP is ignored: discovery records where the caller connected from.
		expect(registered.host).toBe(containerIp(CALLER.scraper));
		token = registered.token;
	});

	it("refuses to register another service (identity bound to the SVID)", () => {
		const { status } = discovery("/register", "POST", {
			serviceName: "trader-trainer",
			instanceId: `${INSTANCE}-spoof`,
			ip: "10.0.0.1",
			port: 3000,
		});
		expect(status).toBe(403);
	});

	it("lists the registered instance", () => {
		const services = JSON.parse(discovery("/services").body);
		expect(services).toContain(SERVICE);
		const instances = JSON.parse(discovery(`/services/${SERVICE}`).body);
		expect(
			instances.map((i: { instanceId: string }) => i.instanceId)
		).toContain(INSTANCE);
	});

	it("accepts a heartbeat carrying the instance token only", () => {
		const identity = { serviceName: SERVICE, instanceId: INSTANCE };
		expect(discovery("/heartbeat", "POST", identity, "forged").status).toBe(
			401
		);
		expect(discovery("/heartbeat", "POST", identity, token).status).toBe(200);
	});

	it("unregisters the instance with its token", () => {
		const identity = { serviceName: SERVICE, instanceId: INSTANCE };
		expect(discovery("/unregister", "POST", identity, token).status).toBe(204);
		expect(discovery(`/services/${SERVICE}/${INSTANCE}`).status).toBe(404);
	});
});
