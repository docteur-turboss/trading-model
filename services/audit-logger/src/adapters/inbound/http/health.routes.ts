import { Router } from "express";
import { createHealthController } from "./health.controller";

export function healthRoutes(): Router {
	const router = Router();
	router.get("/health", createHealthController().health);
	return router;
}
