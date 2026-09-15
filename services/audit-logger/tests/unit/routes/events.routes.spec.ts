import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const MOCK_ROUTER = {
	get: jest.fn(),
};
const MOCK_CONTROLLER = {
	listEvents: jest.fn(),
	getEvent: jest.fn(),
	getStats: jest.fn(),
};

jest.mock("express", () => ({
	Router: jest.fn(() => MOCK_ROUTER),
}));

jest.mock("../../../src/controllers/events.controller", () => ({
	createEventsController: jest.fn(() => MOCK_CONTROLLER),
}));

jest.mock("../../../src/config/metrics", () => ({
	EVENTS_QUERY_DURATION_SECONDS: { observe: jest.fn() },
}));

import { EVENTS_QUERY_DURATION_SECONDS } from "../../../src/config/metrics";
import { eventsRoutes } from "../../../src/routes/events.routes";

describe("eventsRoutes", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should register timed GET routes for events", () => {
		const auditRepo = {} as any;

		const router = eventsRoutes(auditRepo);

		expect(router).toBe(MOCK_ROUTER);
		expect(MOCK_ROUTER.get).toHaveBeenCalledTimes(3);

		const paths = MOCK_ROUTER.get.mock.calls.map((call) => call[0]);
		expect(paths).toEqual(
			expect.arrayContaining(["/events", "/events/stats", "/events/:messageId"])
		);
		for (const call of MOCK_ROUTER.get.mock.calls) {
			expect(typeof call[1]).toBe("function");
		}
	});

	it("should delegate to the controller and observe query duration", async () => {
		const auditRepo = {} as any;

		eventsRoutes(auditRepo);

		const handler = MOCK_ROUTER.get.mock.calls.find(
			(call) => call[0] === "/events"
		)![1];
		MOCK_CONTROLLER.listEvents.mockResolvedValue({ status: 200, data: {} });

		const result = await handler({}, {}, {});

		expect(MOCK_CONTROLLER.listEvents).toHaveBeenCalledWith({}, {}, {});
		expect(result).toEqual({ status: 200, data: {} });
		expect(EVENTS_QUERY_DURATION_SECONDS.observe).toHaveBeenCalledWith(
			expect.any(Number)
		);
	});
});
