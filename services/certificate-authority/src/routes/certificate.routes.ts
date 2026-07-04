import { Router } from "express";

import {
	getCertificate,
	revokeCertificate,
	signCertificate,
} from "../controllers/certificate.controller";

export function certificateRoutes(): Router {
	const router = Router();

	router.post("/sign", signCertificate);
	router.get("/:serviceId", getCertificate);
	router.post("/revoke", revokeCertificate);

	return router;
}
