import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { NextFunction, Request, Response } from "express";
import { BROKER_ROUTES } from "../../../../src/messaging/transport/http.routes";
import { createMockDispatcher } from "../../../helpers/broker.helper";

describe("BROKER_ROUTES", () => {
	let router: ReturnType<typeof BROKER_ROUTES>;
	let mockDispatcher: ReturnType<typeof createMockDispatcher>;

	beforeEach(() => {
		mockDispatcher = createMockDispatcher();
		router = BROKER_ROUTES(mockDispatcher as never);
	});

	it("should return an Express Router", () => {
		expect(router).toBeDefined();
		expect(typeof router).toBe("function");
	});

	it("should define POST /message route", () => {
		const route = router.stack.find(
			(r: { route?: { path?: string } }) => r.route?.path === "/message"
		);
		expect(route).toBeDefined();
	});

	it("should define POST /subscription route", () => {
		const route = router.stack.find(
			(r: { route?: { path?: string } }) => r.route?.path === "/subscription"
		);
		expect(route).toBeDefined();
	});

	it("should define DELETE /subscription route", () => {
		const route = router.stack.find(
			(r: { route?: { path?: string } }) => r.route?.path === "/subscription"
		);
		expect(route).toBeDefined();
	});

	it("should have exactly 3 routes", () => {
		expect(router.stack.length).toBe(3);
	});

	it("should set timeout on incoming requests", () => {
		const postRoute = router.stack.find(
			(r: { route?: { methods?: Record<string, boolean> } }) =>
				r.route?.methods?.post
		);

		const routeStack = (
			postRoute as {
				route: { stack: Array<{ handle: (...args: unknown[]) => unknown }> };
			}
		).route.stack;

		const setTimeout = jest.fn();
		const req = { setTimeout } as unknown as Request;
		const res = {} as Response;
		const next = jest.fn();

		const timeoutMiddleware = routeStack[0].handle as (
			req: Request,
			res: Response,
			next: NextFunction
		) => void;
		timeoutMiddleware(req, res, next);

		expect(setTimeout).toHaveBeenCalled();
		expect(next).toHaveBeenCalled();
	});
});
