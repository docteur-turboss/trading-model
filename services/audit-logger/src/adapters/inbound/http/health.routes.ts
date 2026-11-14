import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import { catchSync } from "@trading-model/http/adapters/inbound/catch-error";
import {
	HEALTH_STATUS_OK,
	sendResponse,
} from "@trading-model/http/adapters/inbound/response-exception";
import { Router } from "express";

export function healthRoutes(): Router {
	const router = Router();
	router.get(
		"/health",
		catchSync(() =>
			sendResponse(
				{ status: HEALTH_STATUS_OK, timestamp: new Date().toISOString() },
				HTTP_STATUS.OK
			)
		)
	);
	return router;
}
