import { describe, expect, it, jest } from "@jest/globals";
import { DurationMs, PositiveInt } from "../../src/domain/primitives";

let mockApp: any;

jest.mock("express", () => {
	mockApp = {
		use: jest.fn().mockReturnThis(),
		set: jest.fn().mockReturnThis(),
		get: jest.fn().mockReturnThis(),
	};
	const expressFn: any = jest.fn(() => mockApp);
	expressFn.json = jest.fn(() => "jsonParser");
	expressFn.urlencoded = jest.fn(() => "urlencodedParser");
	expressFn.Router = jest.fn(() => ({ use: jest.fn().mockReturnThis() }));
	return expressFn;
});

jest.mock("helmet", () => jest.fn(() => "helmetMiddleware"));

jest.mock("express-rate-limit", () => ({
	rateLimit: jest.fn(() => "rateLimitMiddleware"),
}));

import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { configureApp } from "../../src/server/configure-app";

describe("configureApp", () => {
	it("should create app with helmet, body parsers, rate limiter, and ping route", () => {
		const app = configureApp();

		expect(express).toHaveBeenCalled();
		expect(app).toBe(mockApp);
		expect(mockApp.use).toHaveBeenCalledWith(helmet());
		expect(mockApp.use).toHaveBeenCalledWith("jsonParser");
		expect(mockApp.use).toHaveBeenCalledWith("urlencodedParser");
		expect(mockApp.use).toHaveBeenCalledWith("rateLimitMiddleware");
		expect(mockApp.get).toHaveBeenCalledWith("/ping", expect.any(Function));
	});

	it("should not set trust proxy by default", () => {
		mockApp.set.mockClear();
		configureApp();
		expect(mockApp.set).not.toHaveBeenCalled();
	});

	it("should set trust proxy when explicitly enabled", () => {
		mockApp.set.mockClear();
		configureApp({ trustProxy: true });
		expect(mockApp.set).toHaveBeenCalledWith("trust proxy", "loopback");
	});

	it("should skip trust proxy when false", () => {
		mockApp.set.mockClear();
		configureApp({ trustProxy: false });
		expect(mockApp.set).not.toHaveBeenCalled();
	});

	it("should apply custom rate limit config", () => {
		configureApp({
			rateLimit: {
				windowMs: DurationMs.of(60000),
				limit: PositiveInt.of(50),
			},
		});
		expect(rateLimit).toHaveBeenCalledWith(
			expect.objectContaining({ windowMs: 60000, limit: 50 })
		);
	});

	it("should use default rate limit config when not provided", () => {
		configureApp();
		expect(rateLimit).toHaveBeenCalledWith(
			expect.objectContaining({ windowMs: 900000, limit: 100 })
		);
	});
});
