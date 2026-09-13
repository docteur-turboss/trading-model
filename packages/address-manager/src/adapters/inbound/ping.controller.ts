import { HTTP_STATUS } from "@trading-model/common/http-status";
import { sendResponse } from "@trading-model/http/adapters/inbound/response-exception";
import type { Request, Response } from "express";

/** Handles GET /ping requests. Returns a "pong" response to indicate the service is alive. */
export function pingController(_: Request, res: Response) {
	const response = sendResponse("pong", HTTP_STATUS.CREATED);

	return res.status(response.status).json(response.data);
}
