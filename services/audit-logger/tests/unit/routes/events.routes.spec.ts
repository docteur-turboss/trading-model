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

import { eventsRoutes } from "../../../src/routes/events.routes";

describe("eventsRoutes", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should register GET routes for events", () => {
		const auditRepo = {} as any;

		const router = eventsRoutes(auditRepo);

		expect(router).toBe(MOCK_ROUTER);
		expect(MOCK_ROUTER.get).toHaveBeenCalledWith(
			"/events",
			MOCK_CONTROLLER.listEvents
		);
		expect(MOCK_ROUTER.get).toHaveBeenCalledWith(
			"/events/stats",
			MOCK_CONTROLLER.getStats
		);
		expect(MOCK_ROUTER.get).toHaveBeenCalledWith(
			"/events/:messageId",
			MOCK_CONTROLLER.getEvent
		);
	});
});
