import { Router } from "express";

import { metricsController } from "../metrics.controller";

const ROUTER = Router();

ROUTER.get("/status", metricsController);

/** Express router of the status and metrics endpoints. */
export const STATUS_ROUTES = ROUTER;
