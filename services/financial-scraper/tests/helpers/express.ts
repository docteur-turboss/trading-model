import type { NextFunction, Request, Response } from "express";

export const createReq = (
	overrides: Record<string, unknown> = {}
): Partial<Request> => ({
	body: {},
	params: {},
	headers: {},
	...overrides,
});

export const createRes = (): Partial<Response> => ({});

export const createNext: NextFunction = (() =>
	undefined) as unknown as NextFunction;
