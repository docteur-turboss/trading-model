import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { NextFunction, Request, Response } from "express";

jest.mock("express-rate-limit", () => {
	return jest.fn(
		() => (_req: unknown, _res: unknown, next: () => void) => next()
	);
});

import { BROKER_ROUTES } from "../../../../src/adapters/inbound/http.routes";
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

	it.each([
		["post", "/message"],
		["post", "/message/replay"],
		["post", "/subscribe"],
		["delete", "/subscribe"],
	])("should define %s %s", (method, path) => {
		const route = router.stack.find((r) => {
			const layer = r.route as
				| { path?: string; methods?: Record<string, boolean> }
				| undefined;
			return layer?.path === path && layer.methods?.[method] === true;
		});
		expect(route).toBeDefined();
	});

	it("should have exactly 5 routes", () => {
		expect(router.stack.length).toBe(5);
	});

	it("should set timeout on incoming requests", () => {
		const postRoute = router.stack.find(
			(r) =>
				(r.route as { methods?: Record<string, boolean> } | undefined)?.methods
					?.post
		);

		const routeStack = (
			postRoute as {
				route: { stack: Array<{ handle: (...args: unknown[]) => unknown }> };
			}
		).route.stack;

		const setTimeout = jest.fn<(...args: any[]) => any>();
		const req = { setTimeout } as unknown as Request;
		const res = {} as Response;
		const next = jest.fn<(...args: any[]) => any>();

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
