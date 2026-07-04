import { Router } from "express";

import { getCrl } from "../controllers/crl.controller";

export function crlRoutes(): Router {
	const router = Router();

	router.get("/crl", getCrl);

	return router;
}
