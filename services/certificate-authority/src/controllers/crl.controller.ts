import { logger } from "@trading-model/common/config/logger";
import type { Request, Response } from "express";

import { CONTAINER } from "../app/container";

export async function getCrl(_req: Request, res: Response): Promise<void> {
	try {
		const crl = await CONTAINER.crlStore.getAll();

		res.status(200).json({
			lastUpdate: new Date(),
			entries: crl,
		});
	} catch (err) {
		logger.error("Failed to get CRL", { err });
		res.status(500).json({ error: "Failed to get CRL" });
	}
}
