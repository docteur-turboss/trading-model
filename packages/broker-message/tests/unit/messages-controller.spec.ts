import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { EVENT_MANAGER } from "../../src/client/event-manager-client";
import { MESSAGE_CONTROLLER } from "../../src/http/messages.controller";

function flushMicrotasks(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("MESSAGE_CONTROLLER", () => {
	let req: any;
	let res: any;
	let next: jest.Mock;

	function makeValidReq() {
		return {
			body: {
				metadata: {
					topic: "example.debug.create",
					eventType: "example.debug.create",
					publisher: {
						serviceName: ServiceInstanceName.DiscoveryService,
						instanceId: "550e8400-e29b-41d4-a716-446655440000",
					},
					schemaVersion: "1.0.0",
				},
				payload: { debug: true },
			},
		};
	}

	beforeEach(() => {
		EVENT_MANAGER.removeAllListeners?.();
		req = makeValidReq();
		res = {
			status: jest.fn().mockReturnThis(),
			json: jest.fn().mockReturnThis(),
		};
		next = jest.fn();
	});

	it("should process valid message and emit event", async () => {
		const callback = jest.fn();
		EVENT_MANAGER.on("example.debug.create", callback);

		await MESSAGE_CONTROLLER(req, res, next);
		await flushMicrotasks();

		expect(callback).toHaveBeenCalledWith({ debug: true });
	});

	it("should throw BadRequest for missing metadata (via catchSync next)", async () => {
		req.body.metadata = undefined;

		await MESSAGE_CONTROLLER(req, res, next);
		await flushMicrotasks();

		expect(next).toHaveBeenCalled();
		expect(next.mock.calls[0][0]).toBeDefined();
	});

	it("should throw BadRequest for invalid payload", async () => {
		req.body = {
			metadata: {
				topic: "example.debug.create",
				eventType: "example.debug.create",
				publisher: {
					serviceName: ServiceInstanceName.DiscoveryService,
					instanceId: "550e8400-e29b-41d4-a716-446655440000",
				},
				schemaVersion: "1.0.0",
			},
			payload: { invalid: "data" },
		};

		await MESSAGE_CONTROLLER(req, res, next);
		await flushMicrotasks();

		expect(next).toHaveBeenCalled();
		expect(next.mock.calls[0][0]).toBeDefined();
	});

	it("should handle void events (no payload data)", async () => {
		const callback = jest.fn();
		EVENT_MANAGER.on("example.show.create", callback);

		req = {
			body: {
				metadata: {
					topic: "example.show.create",
					eventType: "example.show.create",
					publisher: {
						serviceName: ServiceInstanceName.DiscoveryService,
						instanceId: "550e8400-e29b-41d4-a716-446655440000",
					},
					schemaVersion: "1.0.0",
				},
				payload: undefined,
			},
		};

		await MESSAGE_CONTROLLER(req, res, next);
		await flushMicrotasks();

		expect(callback).toHaveBeenCalled();
	});
});
