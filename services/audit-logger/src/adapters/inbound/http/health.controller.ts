import type { HttpStatusCode } from "@trading-model/contracts/http-status";
import { catchSync } from "@trading-model/http/adapters/inbound/catch-error";
import {
	HEALTH_STATUS_OK,
	sendResponse,
} from "@trading-model/http/adapters/inbound/response-exception";
import type { RequestHandler } from "express";

export function createHealthController(): { health: RequestHandler } {
	const health: RequestHandler = catchSync(() =>
		sendResponse(
			{ status: HEALTH_STATUS_OK, timestamp: new Date().toISOString() },
			200 as HttpStatusCode
		)
	);

	return { health };
}
