import { sendResponse } from "@trading-model/common/middleware/response-exception";
import type { Request, Response } from "express";

/** Handles GET /ping requests. Returns a "pong" response to indicate the service is alive. */
export function pingController(_: Request, res: Response) {
	const response = sendResponse("pong", 201);

	return res.status(response.status).json(response.data);
}
