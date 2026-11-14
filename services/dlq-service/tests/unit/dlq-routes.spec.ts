import { describe, expect, it } from "@jest/globals";
import type { Router } from "express";

// Real modules, real env parsing: only the process environment is faked.
Object.assign(process.env, {
	DLQ_AUTH_HMAC_SECRET: "test-secret-16-chars",
	DLQ_ALLOWED_SERVICES: "message-manager,admin",
	INSTANCE_ID: "test-dlq-1",
	PORT: "3000",
	TLS_KEY_PATH: "/tmp/key",
	TLS_CERT_PATH: "/tmp/cert",
	TLS_CA_PATH: "/tmp/ca",
});

describe("DLQ Routes", () => {
	let DlqRoutes: (handlers: never) => Router;

	beforeAll(() => {
		DlqRoutes = require("../../src/adapters/inbound/routes").DlqRoutes;
	});

	it("should create a router with all endpoints", () => {
		const router = DlqRoutes({} as never);
		expect(router).toBeDefined();

		const stack = router.stack || [];
		const paths = stack
			.filter(
				(layer: {
					route?: { path?: string; methods?: Record<string, boolean> };
				}) => layer.route
			)
			.map((layer) => {
				const route = layer.route as unknown as {
					path: string;
					methods: Record<string, boolean>;
				};
				return { path: route.path, methods: Object.keys(route.methods) };
			});

		expect(paths).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					path: "/dlq",
					methods: expect.arrayContaining(["post"]),
				}),
				expect.objectContaining({
					path: "/dlq",
					methods: expect.arrayContaining(["get"]),
				}),
				expect.objectContaining({
					path: "/dlq",
					methods: expect.arrayContaining(["delete"]),
				}),
				expect.objectContaining({
					path: "/dlq/replay",
					methods: expect.arrayContaining(["post"]),
				}),
				expect.objectContaining({
					path: "/health",
					methods: expect.arrayContaining(["get"]),
				}),
				expect.objectContaining({
					path: "/health/ready",
					methods: expect.arrayContaining(["get"]),
				}),
				expect.objectContaining({
					path: "/metrics",
					methods: expect.arrayContaining(["get"]),
				}),
			])
		);
	});
});
