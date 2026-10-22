import { describe, expect, it } from "@jest/globals";
import type { HttpStatusCode } from "../../src/http-status";
import { HTTP_STATUS } from "../../src/http-status";

describe("HTTP_STATUS", () => {
	it("exposes the canonical 2xx statuses", () => {
		expect(HTTP_STATUS.OK).toBe(200);
		expect(HTTP_STATUS.CREATED).toBe(201);
		expect(HTTP_STATUS.ACCEPTED).toBe(202);
		expect(HTTP_STATUS.NO_CONTENT).toBe(204);
	});

	it("exposes the canonical 4xx statuses", () => {
		expect(HTTP_STATUS.BAD_REQUEST).toBe(400);
		expect(HTTP_STATUS.UNAUTHORIZED).toBe(401);
		expect(HTTP_STATUS.FORBIDDEN).toBe(403);
		expect(HTTP_STATUS.NOT_FOUND).toBe(404);
		expect(HTTP_STATUS.CONFLICT).toBe(409);
		expect(HTTP_STATUS.TOO_MANY_REQUESTS).toBe(429);
	});

	it("exposes the canonical 5xx statuses", () => {
		expect(HTTP_STATUS.INTERNAL_SERVER_ERROR).toBe(500);
		expect(HTTP_STATUS.BAD_GATEWAY).toBe(502);
		expect(HTTP_STATUS.SERVICE_UNAVAILABLE).toBe(503);
		expect(HTTP_STATUS.GATEWAY_TIMEOUT).toBe(504);
	});

	it("keeps branded values assignable to HttpStatusCode", () => {
		const code: HttpStatusCode = HTTP_STATUS.NOT_FOUND;
		expect(typeof code).toBe("number");
	});
});
