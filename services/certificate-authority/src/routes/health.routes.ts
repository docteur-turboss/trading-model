import { Router } from "express";

import { health } from "../controllers/health.controller";

export function healthRoutes(): Router {
	const router = Router();

	router.get("/health", health);

	return router;
}
