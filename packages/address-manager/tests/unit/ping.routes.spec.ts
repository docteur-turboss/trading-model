import { describe, expect, it } from "@jest/globals";
import { PING_PATH } from "@trading-model/http/shared/constants";
import { pingController } from "../../src/ping.controller";
import { PING_ROUTES } from "../../src/routes/ping.routes";

describe("PING_ROUTES", () => {
	it("should mount the ping controller on GET PING_PATH", () => {
		const layer = PING_ROUTES.stack.find((l) => l.route?.path === PING_PATH);
		const route = layer?.route as unknown as {
			methods: Record<string, boolean>;
			stack: Array<{ handle: unknown }>;
		};
		expect(route.methods.get).toBe(true);
		expect(route.stack[0]?.handle).toBe(pingController);
	});
});
