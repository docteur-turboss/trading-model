import { HTTP_STATUS } from "@trading-model/common/http-status";
import { logger } from "@trading-model/common/config/logger";
import type { Request, Response } from "express";

import { CONTAINER } from "../app";

export async function getCrl(_req: Request, res: Response): Promise<void> {
	try {
		const crl = await CONTAINER.crlStore.getAll();

		res.status(HTTP_STATUS.OK).json({
			lastUpdate: new Date(),
			entries: crl,
		});
	} catch (err) {
		logger.error("Failed to get CRL", { context: { err } });
		res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: "Failed to get CRL" });
	}
}
