import { HTTP_STATUS } from "@trading-model/common/http-status";
import { sendResponse } from "@trading-model/common/middleware/response-exception";
import type { Request, Response } from "express";

export function metricsController(req: Request, res: Response) {
	const snapshot = req.app.locals.metricsSnapshot as
		| (() => Record<string, unknown>)
		| undefined;
	const data = snapshot ? snapshot() : {};
	const response = sendResponse(data, HTTP_STATUS.OK);
	return res.status(response.status).json(response.data);
}
